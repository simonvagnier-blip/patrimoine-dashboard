import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gte } from "drizzle-orm";
import { chainTwr, flowsFromOperations } from "@/lib/twr";
import { getEnvelopeSnapshotSeries } from "@/lib/envelope-snapshots";
import {
  BENCHMARKS,
  defaultBenchmarkFor,
  fetchBenchmarkSeries,
} from "@/lib/benchmark-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/envelope-benchmark?envelope_id=pea&days=90&index=world
 *
 * « Est-ce que je bats le marché ? » — série TWR de l'enveloppe (apports
 * neutralisés, méthode GIPS) rebasée à 0 %, superposée à un ETF indiciel
 * EUR capitalisant rebasé à la même date. Auth : session (middleware).
 */

/** Taux FX depuis le dernier fetch réussi (C1) — évite d'empoisonner le
 *  cache de cours avec un fetchAllQuotes sans tickers. Précision faible
 *  requise : sert uniquement à convertir les flux USD/MGA. */
async function readFxRates(): Promise<{ eurUsd: number; mgaEurRate: number }> {
  try {
    const row = await db
      .select()
      .from(schema.userParams)
      .where(eq(schema.userParams.key, "lastKnownQuotes"))
      .get();
    if (row) {
      const parsed = JSON.parse(row.value) as { eurUsd?: number; mgaEurRate?: number };
      return {
        eurUsd: parsed.eurUsd && parsed.eurUsd > 0 ? parsed.eurUsd : 1.08,
        mgaEurRate: parsed.mgaEurRate && parsed.mgaEurRate > 0 ? parsed.mgaEurRate : 4800,
      };
    }
  } catch {}
  return { eurUsd: 1.08, mgaEurRate: 4800 };
}

export async function GET(request: NextRequest) {
  const envelopeId = request.nextUrl.searchParams.get("envelope_id");
  if (!envelopeId) {
    return NextResponse.json({ error: "envelope_id requis" }, { status: 400 });
  }
  const days = Math.min(
    3650,
    Math.max(14, parseInt(request.nextUrl.searchParams.get("days") || "90"))
  );
  const envelope = await db
    .select()
    .from(schema.envelopes)
    .where(eq(schema.envelopes.id, envelopeId))
    .get();
  if (!envelope) {
    return NextResponse.json({ error: "enveloppe inconnue" }, { status: 404 });
  }
  // Livrets : les dépôts ne sont pas journalisés → tout versement serait lu
  // comme de la performance (TWR mensonger, vérifié : +106 % sur 90 j).
  // Business : valorisation manuelle + deals privés, un indice n'a pas de sens.
  if (envelope.type === "livrets" || envelope.type === "business") {
    return NextResponse.json({
      envelope_id: envelopeId,
      days,
      error:
        envelope.type === "livrets"
          ? "Sans objet pour les livrets (flux non journalisés — le TWR serait faux)"
          : "Sans objet pour une enveloppe business (valorisation manuelle)",
      points: [],
    });
  }

  const indexKeyRaw = request.nextUrl.searchParams.get("index");
  const indexKey =
    indexKeyRaw && BENCHMARKS[indexKeyRaw]
      ? indexKeyRaw
      : defaultBenchmarkFor(envelope.type);
  const benchmark = BENCHMARKS[indexKey];

  const fromYmd = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);

  // 1. Série de valorisations quotidiennes de l'enveloppe
  const values = await getEnvelopeSnapshotSeries(envelopeId, fromYmd);
  if (values.length < 5) {
    return NextResponse.json({
      envelope_id: envelopeId,
      benchmark: { key: indexKey, ...benchmark },
      days,
      error: "Pas assez d'historique de snapshots pour cette enveloppe sur la période",
      points: [],
    });
  }

  // 2. Flux externes (achats/dépôts − ventes/retraits) sur la fenêtre
  const { eurUsd, mgaEurRate } = await readFxRates();
  const ops = await db
    .select()
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.envelope_id, envelopeId),
        gte(schema.operations.date, fromYmd)
      )
    )
    .all();
  const flows = flowsFromOperations(ops, (amount, currency) => {
    if (currency === "USD") return amount / eurUsd;
    if (currency === "MGA") return amount / mgaEurRate;
    return amount;
  });

  // 3. TWR chaîné
  const twr = chainTwr(
    values.map((v) => ({ date: v.date, value: v.close })),
    flows
  );

  // 4. Série benchmark rebasée à la première date du portefeuille
  let benchPoints: Array<{ date: string; pct: number }> = [];
  let benchmarkError: string | null = null;
  try {
    const raw = await fetchBenchmarkSeries(benchmark.ticker, twr.first_date ?? fromYmd);
    const base = raw.find((p) => p.date >= (twr.first_date ?? fromYmd)) ?? raw[0];
    benchPoints = raw
      .filter((p) => p.date >= base.date)
      .map((p) => ({ date: p.date, pct: (p.close / base.close - 1) * 100 }));
  } catch (err) {
    benchmarkError = (err as Error).message;
  }

  // 5. Fusion par date (forward-fill du benchmark sur les jours sans bourse)
  const benchByDate = new Map(benchPoints.map((p) => [p.date, p.pct]));
  let lastBench: number | null = null;
  const points = twr.series.map((p) => {
    if (benchByDate.has(p.date)) lastBench = benchByDate.get(p.date)!;
    return {
      date: p.date,
      portfolio_pct: Math.round(p.pct * 100) / 100,
      benchmark_pct: lastBench !== null ? Math.round(lastBench * 100) / 100 : null,
    };
  });

  return NextResponse.json({
    envelope_id: envelopeId,
    envelope_name: envelope.name,
    benchmark: { key: indexKey, ...benchmark },
    available: Object.entries(BENCHMARKS).map(([key, b]) => ({ key, label: b.label })),
    days,
    twr_pct: twr.twr !== null ? Math.round(twr.twr * 10000) / 100 : null,
    twr_annualized_pct:
      twr.twr_annualized !== null ? Math.round(twr.twr_annualized * 10000) / 100 : null,
    benchmark_pct:
      points.length && points[points.length - 1].benchmark_pct !== null
        ? points[points.length - 1].benchmark_pct
        : null,
    first_date: twr.first_date,
    last_date: twr.last_date,
    benchmark_error: benchmarkError,
    points,
  });
}
