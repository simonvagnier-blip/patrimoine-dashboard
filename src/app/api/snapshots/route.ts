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
  // Sert pour details_json ET pour envelope_snapshots (même source).
  let serverDetails: Record<string, number> = {};
  try {
    const envValues = await computeAllEnvelopeValues();
    serverDetails = Object.fromEntries(envValues.map((v) => [v.envelopeId, v.valueEur]));
  } catch {
    // Fallback : si le calcul serveur échoue, on retombe sur les details client.
    serverDetails = body.details && typeof body.details === "object" ? body.details : {};
  }

  // Global snapshot. total_value / invested_total = valeurs live affichées par
  // le dashboard ; details_json = valeurs serveur (cohérentes avec le graph).
  const existing = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.date, today))
    .get();

  if (existing) {
    await db.update(schema.snapshots)
      .set({
        total_value: body.total_value,
        invested_total: body.invested_total ?? null,
        details_json: JSON.stringify(serverDetails),
      })
      .where(eq(schema.snapshots.id, existing.id))
      .run();
  } else {
    await db.insert(schema.snapshots)
      .values({
        date: today,
        total_value: body.total_value,
        invested_total: body.invested_total ?? null,
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
