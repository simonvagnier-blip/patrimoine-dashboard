import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month"); // YYYY-MM

  if (month) {
    // Filter entries whose date falls within the given month
    const startDate = `${month}-01`;
    // Compute first day of next month
    const [y, m] = month.split("-").map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    const rows = await db.select().from(schema.budgetEntries)
      .where(and(
        gte(schema.budgetEntries.date, startDate),
        lt(schema.budgetEntries.date, nextMonth),
      )).all();
    return NextResponse.json(rows);
  }

  const rows = await db.select().from(schema.budgetEntries).all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();
  const result = await db.insert(schema.budgetEntries).values({
    type: body.type,
    category: body.category,
    label: body.label,
    amount: body.amount,
    date: body.date,
    recurring: body.recurring || 0,
    created_at: now,
  }).returning().get();
  return NextResponse.json(result, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.type !== undefined) updates.type = body.type;
  if (body.category !== undefined) updates.category = body.category;
  if (body.label !== undefined) updates.label = body.label;
  if (body.amount !== undefined) updates.amount = body.amount;
  if (body.date !== undefined) updates.date = body.date;
  if (body.recurring !== undefined) updates.recurring = body.recurring;

  const result = await db.update(schema.budgetEntries).set(updates).where(eq(schema.budgetEntries.id, body.id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.budgetEntries).where(eq(schema.budgetEntries.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
