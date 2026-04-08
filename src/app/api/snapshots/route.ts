import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

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
    .where(({ date }) => {
      // manual SQL comparison since drizzle sqlite doesn't have gte for text
      return undefined as unknown as ReturnType<typeof eq>;
    })
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
        details_json: JSON.stringify(body.details),
      })
      .where(eq(schema.snapshots.id, existing.id))
      .run();
  } else {
    await db.insert(schema.snapshots)
      .values({
        date: today,
        total_value: body.total_value,
        details_json: JSON.stringify(body.details),
        created_at: new Date().toISOString(),
      })
      .run();
  }

  return NextResponse.json({ success: true });
}
