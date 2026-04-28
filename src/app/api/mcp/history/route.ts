import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const RANGE_DAYS: Record<string, number | null> = {
  "1w": 7,
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
  all: null,
};

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;

  const range = request.nextUrl.searchParams.get("range") || "all";
  const days = RANGE_DAYS[range] ?? null;
  const fromYmd =
    days !== null
      ? new Date(Date.now() - days * 86400000).toISOString().split("T")[0]
      : null;

  const rows = await db.select().from(schema.envelopeSnapshots).all();
  const filtered = fromYmd ? rows.filter((r) => r.date >= fromYmd) : rows;

  // Group by date, merge envelopes into one row per day
  const byDate = new Map<string, { date: string; total_eur: number; by_envelope: Record<string, number> }>();
  for (const r of filtered) {
    const key = r.date;
    if (!byDate.has(key)) {
      byDate.set(key, { date: key, total_eur: 0, by_envelope: {} });
    }
    const entry = byDate.get(key)!;
    entry.by_envelope[r.envelope_id] = r.value_eur;
    entry.total_eur += r.value_eur;
  }
  const series = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  // Round totals
  for (const s of series) {
    s.total_eur = Math.round(s.total_eur * 100) / 100;
  }

  return NextResponse.json({
    range,
    from: fromYmd,
    point_count: series.length,
    series,
  });
}
