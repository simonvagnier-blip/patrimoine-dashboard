import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq, and } from "drizzle-orm";
import { computeAllEnvelopeValues } from "@/lib/envelope-snapshots";

export const dynamic = "force-dynamic";

// GET snapshots (last N days)
export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get("days") || "90");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const rows = await db
    .select()
    .from(schema.snapshots)
    .orderBy(desc(schema.snapshots.date))
    .all();

  // Filter in JS for simplicity
  const filtered = rows.filter((r) => r.date >= cutoffStr);
  return NextResponse.json(filtered.reverse()); // chronological order
}

// POST a new snapshot
export async function POST(request: NextRequest) {
  const body = await request.json();
  const today = new Date().toISOString().split("T")[0];
  const nowIso = new Date().toISOString();

  // Valeurs par enveloppe calculées CÔTÉ SERVEUR, via la MÊME fonction que le
  // cron nocturne (computeAllEnvelopeValues). Ainsi POST et cron écrivent des
  // EUR IDENTIQUES pour (envelope_id, date) → fini la divergence "last-write-
  // wins" entre la card du dashboard (quotes client) et le graph (quotes cron).
  // Sert pour details_json, envelope_snapshots ET le total global (le client
  // n'est plus cru sur parole : son total ne sert que de fallback).
  let serverDetails: Record<string, number> = {};
  let serverComputeOk = false;
  try {
    const { values, degraded, missingTickers } = await computeAllEnvelopeValues();
    // Valorisation sous-estimée (position cotée sans AUCUN prix, ni live ni
    // dernier cours connu) : on refuse d'écrire un point d'historique faux.
    // Le point de la veille reste le dernier ; un passage sain rattrapera.
    if (degraded) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: `valorisation dégradée — tickers sans prix : ${missingTickers.join(", ")}`,
      });
    }
    serverDetails = Object.fromEntries(values.map((v) => [v.envelopeId, v.valueEur]));
    serverComputeOk = true;
  } catch {
    // Fallback : si le calcul serveur échoue, on retombe sur les details client.
    serverDetails = body.details && typeof body.details === "object" ? body.details : {};
  }

  const clientTotal = Number.isFinite(body.total_value) ? (body.total_value as number) : null;
  const serverTotal = serverComputeOk
    ? Math.round(Object.values(serverDetails).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) * 100) / 100
    : null;
  const totalValue = serverTotal ?? clientTotal;
  if (totalValue === null) {
    return NextResponse.json(
      { success: false, error: "total_value invalide et calcul serveur indisponible" },
      { status: 400 }
    );
  }

  const existing = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.date, today))
    .get();

  // Ceinture + bretelles : un patrimoine qui perd >50 % en un jour n'est pas
  // un mouvement de marché, c'est un bug de valorisation. On garde le dernier
  // point sain plutôt que d'écraser l'historique (le log garde la trace).
  const previous = await db
    .select()
    .from(schema.snapshots)
    .orderBy(desc(schema.snapshots.date))
    .limit(2)
    .all();
  const reference = previous.find((r) => r.date !== today);
  if (reference && reference.total_value > 0 && totalValue < 0.5 * reference.total_value) {
    console.warn(
      `snapshot POST: chute implausible ${reference.total_value} → ${totalValue} €, écriture refusée`
    );
    return NextResponse.json({
      success: false,
      skipped: true,
      reason: `chute implausible vs ${reference.date} (${reference.total_value} € → ${totalValue} €)`,
    });
  }

  const investedTotal = Number.isFinite(body.invested_total) ? (body.invested_total as number) : null;
  if (existing) {
    await db.update(schema.snapshots)
      .set({
        total_value: totalValue,
        invested_total: investedTotal,
        details_json: JSON.stringify(serverDetails),
      })
      .where(eq(schema.snapshots.id, existing.id))
      .run();
  } else {
    await db.insert(schema.snapshots)
      .values({
        date: today,
        total_value: totalValue,
        invested_total: investedTotal,
        details_json: JSON.stringify(serverDetails),
        created_at: nowIso,
      })
      .run();
  }

  // envelope_snapshots : upsert depuis les MÊMES valeurs serveur. Guard durci :
  // on n'ignore que les valeurs non finies (NaN/Infinity), pas les valeurs
  // basses (avant : `value < 0` figeait silencieusement la valeur de la veille).
  for (const [envelopeId, value] of Object.entries(serverDetails)) {
    if (!Number.isFinite(value)) continue;
    const existingEnv = await db
      .select()
      .from(schema.envelopeSnapshots)
      .where(
        and(
          eq(schema.envelopeSnapshots.envelope_id, envelopeId),
          eq(schema.envelopeSnapshots.date, today),
        ),
      )
      .get();
    if (existingEnv) {
      await db
        .update(schema.envelopeSnapshots)
        .set({ value_eur: value })
        .where(
          and(
            eq(schema.envelopeSnapshots.envelope_id, envelopeId),
            eq(schema.envelopeSnapshots.date, today),
          ),
        )
        .run();
    } else {
      await db
        .insert(schema.envelopeSnapshots)
        .values({
          envelope_id: envelopeId,
          date: today,
          value_eur: value,
          created_at: nowIso,
        })
        .run();
    }
  }

  return NextResponse.json({ success: true });
}
