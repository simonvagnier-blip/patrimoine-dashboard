import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  ensureTodaySnapshotForEnvelope,
  getEnvelopeSnapshotSeries,
} from "@/lib/envelope-snapshots";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export const dynamic = "force-dynamic";

interface ChartPoint {
  date: string; // YYYY-MM-DD
  close: number; // in EUR
}

interface YahooChartResult {
  meta?: { currency?: string } & Record<string, unknown>;
  quotes?: Array<{ date?: string | Date; close?: number | null } & Record<string, unknown>>;
}

// Cache: envelopeId+range -> data
const cache = new Map<string, { data: ChartPoint[]; time: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const RANGE_MAP: Record<string, { period1: Date; interval: string }> = {
  "1w": { period1: new Date(Date.now() - 7 * 86400000), interval: "1d" },
  "1mo": { period1: new Date(Date.now() - 30 * 86400000), interval: "1d" },
  "3mo": { period1: new Date(Date.now() - 90 * 86400000), interval: "1d" },
  "6mo": { period1: new Date(Date.now() - 180 * 86400000), interval: "1wk" },
  "1y": { period1: new Date(Date.now() - 365 * 86400000), interval: "1wk" },
};

async function fetchEurUsd(period1: Date, interval: string): Promise<number> {
  // Current spot rate is good enough — historical FX curve is a secondary
  // refinement we can add later if needed.
  try {
    const r = (await yahooFinance.chart("EURUSD=X", {
      period1,
      period2: new Date(),
      interval,
    })) as YahooChartResult;
    const price = r?.meta?.regularMarketPrice as number | undefined;
    if (typeof price === "number" && price > 0) return price;
  } catch {}
  return 1.08;
}

export async function GET(request: NextRequest) {
  const envelopeId = request.nextUrl.searchParams.get("id");
  const range = request.nextUrl.searchParams.get("range") || "1mo";
  const mode = request.nextUrl.searchParams.get("mode") || "simulated";

  if (!envelopeId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const rangeConfig = RANGE_MAP[range] || RANGE_MAP["1mo"];

  // Real mode: serve from envelope_snapshots. Side effect: refresh today's
  // point live so the curve ends at the current value, not last night's.
  if (mode === "real") {
    try {
      await ensureTodaySnapshotForEnvelope(envelopeId);
    } catch (err) {
      console.error(
        `ensureTodaySnapshotForEnvelope(${envelopeId}) failed:`,
        err
      );
      // non-fatal — we still return whatever is in the table
    }
    const fromYmd = rangeConfig.period1.toISOString().split("T")[0];
    const series = await getEnvelopeSnapshotSeries(envelopeId, fromYmd);
    return NextResponse.json(series);
  }

  // Simulated mode (default): retroactively apply today's quantities to
  // historical prices. Cached for 30 minutes.
  const cacheKey = `${envelopeId}:${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Load positions for this envelope
  const positions = await db
    .select()
    .from(schema.positions)
    .where(eq(schema.positions.envelope_id, envelopeId))
    .all();

  if (positions.length === 0) {
    return NextResponse.json([]);
  }

  // EUR/USD spot (used for USD positions)
  const eurUsd = await fetchEurUsd(rangeConfig.period1, rangeConfig.interval);

  // Static "base" value = sum of positions that have no yahoo_ticker but a
  // manual_value (fonds euros, livrets, etc.). This stays flat across the
  // whole period and gets added to every point.
  let manualBase = 0;
  const tradedPositions: typeof positions = [];
  for (const p of positions) {
    if (!p.yahoo_ticker) {
      if (typeof p.manual_value === "number") manualBase += p.manual_value;
    } else if (typeof p.quantity === "number" && p.quantity > 0) {
      tradedPositions.push(p);
    }
  }

  // Fetch chart data for each traded position in parallel (small batches)
  const seriesByTicker = new Map<
    string,
    { currency: string; points: ChartPoint[] }
  >();
  const batchSize = 5;
  for (let i = 0; i < tradedPositions.length; i += batchSize) {
    const batch = tradedPositions.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const ticker = p.yahoo_ticker as string;
        if (seriesByTicker.has(ticker)) return null;
        const r = (await yahooFinance.chart(ticker, {
          period1: rangeConfig.period1,
          period2: new Date(),
          interval: rangeConfig.interval,
        })) as YahooChartResult;
        const currency = (r?.meta?.currency as string) ?? "EUR";
        const points: ChartPoint[] = (r?.quotes || [])
          .filter((q) => q.close !== null && q.close !== undefined)
          .map((q) => ({
            date: new Date(q.date as string).toISOString().split("T")[0],
            close: q.close as number,
          }));
        return { ticker, currency, points };
      })
    );
    for (const res of results) {
      if (res.status === "fulfilled" && res.value) {
        seriesByTicker.set(res.value.ticker, {
          currency: res.value.currency,
          points: res.value.points,
        });
      }
    }
  }

  // Union of all dates across all series
  const allDates = new Set<string>();
  for (const s of seriesByTicker.values()) {
    for (const pt of s.points) allDates.add(pt.date);
  }
  const sortedDates = Array.from(allDates).sort();

  if (sortedDates.length === 0) {
    const flat: ChartPoint[] =
      manualBase > 0
        ? [
            { date: rangeConfig.period1.toISOString().split("T")[0], close: manualBase },
            { date: new Date().toISOString().split("T")[0], close: manualBase },
          ]
        : [];
    cache.set(cacheKey, { data: flat, time: Date.now() });
    return NextResponse.json(flat);
  }

  // For each position, build a date->close map with forward-fill for missing
  // dates (markets closed, different exchanges). We track the "last known"
  // price as we walk the sorted global date range.
  const priceMaps = new Map<string, Map<string, number>>();
  for (const [ticker, series] of seriesByTicker.entries()) {
    const m = new Map<string, number>();
    for (const pt of series.points) m.set(pt.date, pt.close);
    priceMaps.set(ticker, m);
  }

  // Aggregate: for each date, sum(qty * close in EUR) across traded positions,
  // + manualBase for fixed holdings.
  const aggregated: ChartPoint[] = [];
  const lastKnown = new Map<string, number>(); // ticker -> last price
  for (const date of sortedDates) {
    let total = manualBase;
    let hasAny = false;
    for (const p of tradedPositions) {
      const ticker = p.yahoo_ticker as string;
      const series = seriesByTicker.get(ticker);
      if (!series) continue;
      const m = priceMaps.get(ticker);
      if (!m) continue;
      const priceOnDate = m.get(date);
      if (typeof priceOnDate === "number") lastKnown.set(ticker, priceOnDate);
      const price = lastKnown.get(ticker);
      if (typeof price !== "number") continue; // no data yet for this ticker
      const fx = series.currency === "USD" ? 1 / eurUsd : 1;
      total += (p.quantity as number) * price * fx;
      hasAny = true;
    }
    if (hasAny || manualBase > 0) {
      aggregated.push({ date, close: Math.round(total * 100) / 100 });
    }
  }

  cache.set(cacheKey, { data: aggregated, time: Date.now() });
  return NextResponse.json(aggregated);
}
