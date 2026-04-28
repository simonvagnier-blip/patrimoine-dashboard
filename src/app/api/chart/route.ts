import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export const dynamic = "force-dynamic";

// In-memory cache: ticker+range -> data
const chartCache = new Map<string, { data: ChartPoint[]; time: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface ChartPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

const RANGE_MAP: Record<string, { period1: Date; interval: string }> = {
  "1w": { period1: new Date(Date.now() - 7 * 86400000), interval: "1d" },
  "1mo": { period1: new Date(Date.now() - 30 * 86400000), interval: "1d" },
  "3mo": { period1: new Date(Date.now() - 90 * 86400000), interval: "1d" },
  "6mo": { period1: new Date(Date.now() - 180 * 86400000), interval: "1wk" },
  "1y": { period1: new Date(Date.now() - 365 * 86400000), interval: "1wk" },
};

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  const range = request.nextUrl.searchParams.get("range") || "1mo";

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const cacheKey = `${ticker}:${range}`;
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const rangeConfig = RANGE_MAP[range] || RANGE_MAP["1mo"];

  try {
    const result = await yahooFinance.chart(ticker, {
      period1: rangeConfig.period1,
      period2: new Date(),
      interval: rangeConfig.interval,
    });

    const points: ChartPoint[] = (result.quotes || [])
      .filter((q: Record<string, unknown>) => q.close !== null && q.close !== undefined)
      .map((q: Record<string, unknown>) => ({
        date: new Date(q.date as string).toISOString().split("T")[0],
        close: q.close as number,
      }));

    chartCache.set(cacheKey, { data: points, time: Date.now() });
    return NextResponse.json(points);
  } catch (err) {
    console.error(`Chart fetch failed for ${ticker}:`, err);
    return NextResponse.json([], { status: 200 });
  }
}
