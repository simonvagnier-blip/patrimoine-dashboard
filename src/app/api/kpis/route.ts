import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period"); // YYYY-MM
  if (period) {
    const rows = await db.select().from(schema.kpiEntries).where(eq(schema.kpiEntries.period, period)).all();
    return NextResponse.json(rows);
  }
  const rows = await db.select().from(schema.kpiEntries).all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();

  // Upsert: if metric+period already exists, update the value
  if (body.metric && body.period) {
    const existing = await db.select().from(schema.kpiEntries)
      .where(and(
        eq(schema.kpiEntries.metric, body.metric),
        eq(schema.kpiEntries.period, body.period),
      )).all();

    if (existing.length > 0) {
      const updates: Record<string, unknown> = { value: body.value };
      if (body.target !== undefined) updates.target = body.target;
      const result = await db.update(schema.kpiEntries).set(updates)
        .where(eq(schema.kpiEntries.id, existing[0].id)).returning().get();
      return NextResponse.json(result);
    }
  }

  const result = await db.insert(schema.kpiEntries).values({
    metric: body.metric,
    value: body.value,
    target: body.target || null,
    period: body.period,
    created_at: now,
  }).returning().get();
  return NextResponse.json(result, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.metric !== undefined) updates.metric = body.metric;
  if (body.value !== undefined) updates.value = body.value;
  if (body.target !== undefined) updates.target = body.target;
  if (body.period !== undefined) updates.period = body.period;

  const result = await db.update(schema.kpiEntries).set(updates).where(eq(schema.kpiEntries.id, body.id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.kpiEntries).where(eq(schema.kpiEntries.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
