import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq, and } from "drizzle-orm";

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

  // Check if snapshot already exists for today
  const existing = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.date, today))
    .get();

  if (existing) {
    // Update existing
    await db.update(schema.snapshots)
      .set({
        total_value: body.total_value,
        invested_total: body.invested_total ?? null,
        details_json: JSON.stringify(body.details),
      })
      .where(eq(schema.snapshots.id, existing.id))
      .run();
  } else {
    await db.insert(schema.snapshots)
      .values({
        date: today,
        total_value: body.total_value,
        invested_total: body.invested_total ?? null,
        details_json: JSON.stringify(body.details),
        created_at: new Date().toISOString(),
      })
      .run();
  }

  // Synchronise aussi envelope_snapshots : pour chaque enveloppe présente
  // dans details, upsert la valeur du jour. Évite que la courbe par enveloppe
  // soit en retard d'un jour (sinon dépend uniquement du cron nocturne) et
  // que la card du dashboard et le graph détaillé divergent.
  if (body.details && typeof body.details === "object") {
    const nowIso = new Date().toISOString();
    for (const [envelopeId, value] of Object.entries(body.details)) {
      if (typeof value !== "number" || value < 0) continue;
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
  }

  return NextResponse.json({ success: true });
}
