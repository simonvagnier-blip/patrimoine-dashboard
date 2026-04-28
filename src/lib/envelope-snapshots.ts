import { db, schema } from "@/lib/db";
import { fetchAllQuotes } from "@/lib/quotes";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * Helpers for capturing the "real" per-envelope valuation history.
 *
 * Design: we store one row per (envelope_id, date) in `envelope_snapshots`
 * using today's date in UTC (YYYY-MM-DD). Writes are idempotent thanks to
 * the composite primary key and an UPSERT. The snapshot captures the exact
 * valuation at the moment it's taken, so the curve reflects real movements
 * including deposits, price changes, and FX shifts.
 */

function todayYmd(): string {
  return new Date().toISOString().split("T")[0];
}

export interface EnvelopeValuation {
  envelopeId: string;
  valueEur: number;
}

/**
 * Compute current valuations for every envelope in the database, in EUR.
 * Reuses the cached quotes result so repeated calls within 15 minutes are
 * free.
 */
export async function computeAllEnvelopeValues(): Promise<EnvelopeValuation[]> {
  const positions = await db.select().from(schema.positions).all();
  const tickers = positions
    .map((p) => p.yahoo_ticker)
    .filter((t): t is string => !!t);

  const { quotes, eurUsd } = await fetchAllQuotes(tickers);

  const totals = new Map<string, number>();
  for (const p of positions) {
    let value = 0;
    if (p.yahoo_ticker && typeof p.quantity === "number") {
      const q = quotes[p.yahoo_ticker];
      if (q) {
        const priceEur = q.currency === "USD" ? q.price / eurUsd : q.price;
        value = p.quantity * priceEur;
      }
    } else if (typeof p.manual_value === "number") {
      value = p.manual_value;
    }
    totals.set(p.envelope_id, (totals.get(p.envelope_id) ?? 0) + value);
  }

  // Include envelopes with zero positions as 0, so the history is never
  // sparse after a reset.
  const envelopes = await db.select({ id: schema.envelopes.id }).from(schema.envelopes).all();
  for (const e of envelopes) {
    if (!totals.has(e.id)) totals.set(e.id, 0);
  }

  return Array.from(totals.entries()).map(([envelopeId, valueEur]) => ({
    envelopeId,
    valueEur: Math.round(valueEur * 100) / 100,
  }));
}

/**
 * Upsert one envelope's snapshot for today. Safe to call repeatedly — only
 * the latest value for today's date is kept.
 */
async function upsertSnapshot(envelopeId: string, valueEur: number, date = todayYmd()) {
  await db
    .insert(schema.envelopeSnapshots)
    .values({ envelope_id: envelopeId, date, value_eur: valueEur })
    .onConflictDoUpdate({
      target: [schema.envelopeSnapshots.envelope_id, schema.envelopeSnapshots.date],
      set: { value_eur: valueEur, created_at: sql`CURRENT_TIMESTAMP` },
    });
}

/**
 * Capture snapshots for all envelopes right now. Used by the nightly cron
 * and by on-demand triggers.
 */
export async function snapshotAllEnvelopes(): Promise<{
  date: string;
  count: number;
  values: EnvelopeValuation[];
}> {
  const values = await computeAllEnvelopeValues();
  const date = todayYmd();
  for (const v of values) {
    await upsertSnapshot(v.envelopeId, v.valueEur, date);
  }
  return { date, count: values.length, values };
}

/**
 * Ensure today's snapshot exists for the given envelope. If it's already
 * there, it gets refreshed with the current value — this makes the "today"
 * point on the chart always live. Returns the value used.
 */
export async function ensureTodaySnapshotForEnvelope(
  envelopeId: string
): Promise<number | null> {
  const all = await computeAllEnvelopeValues();
  const match = all.find((v) => v.envelopeId === envelopeId);
  if (!match) return null;
  await upsertSnapshot(envelopeId, match.valueEur);
  return match.valueEur;
}

/**
 * Read a snapshot time-series for one envelope, optionally bounded by a
 * start date (inclusive). Ordered chronologically.
 */
export async function getEnvelopeSnapshotSeries(
  envelopeId: string,
  fromYmd?: string
): Promise<Array<{ date: string; close: number }>> {
  const rows = await db
    .select()
    .from(schema.envelopeSnapshots)
    .where(eq(schema.envelopeSnapshots.envelope_id, envelopeId))
    .all();
  const filtered = fromYmd ? rows.filter((r) => r.date >= fromYmd) : rows;
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  return filtered.map((r) => ({ date: r.date, close: r.value_eur }));
}
