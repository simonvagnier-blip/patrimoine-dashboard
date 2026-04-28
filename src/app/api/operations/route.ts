import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set([
  "buy",
  "sell",
  "deposit",
  "withdrawal",
  "dividend",
  "fee",
  "interest",
  "transfer",
]);

/**
 * GET /api/operations
 *   ?envelope_id=<id>   filter by envelope
 *   ?position_id=<id>   filter by position
 *   ?from=YYYY-MM-DD    date floor (inclusive)
 *   ?to=YYYY-MM-DD      date ceiling (inclusive)
 *   ?order=asc|desc     date order (default: desc = newest first)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const envelopeId = sp.get("envelope_id");
  const positionId = sp.get("position_id");
  const from = sp.get("from");
  const to = sp.get("to");
  const order = sp.get("order") === "asc" ? "asc" : "desc";

  const conditions = [] as ReturnType<typeof eq>[];
  if (envelopeId) conditions.push(eq(schema.operations.envelope_id, envelopeId));
  if (positionId) conditions.push(eq(schema.operations.position_id, parseInt(positionId)));
  if (from) conditions.push(gte(schema.operations.date, from));
  if (to) conditions.push(lte(schema.operations.date, to));

  const rows = await db
    .select()
    .from(schema.operations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(order === "asc" ? asc(schema.operations.date) : desc(schema.operations.date))
    .all();

  return NextResponse.json(rows);
}

/**
 * POST /api/operations  — create a new operation.
 * Body: { envelope_id, date, type, amount, currency?, quantity?, unit_price?, position_id?, note? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { envelope_id, date, type, amount } = body;

  if (!envelope_id || !date || !type || typeof amount !== "number") {
    return NextResponse.json(
      { error: "envelope_id, date, type and amount are required" },
      { status: 400 }
    );
  }
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: `invalid type: ${type}. Must be one of ${[...VALID_TYPES].join(", ")}` },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const result = await db
    .insert(schema.operations)
    .values({
      envelope_id,
      position_id: body.position_id ?? null,
      date,
      type,
      quantity: body.quantity ?? null,
      unit_price: body.unit_price ?? null,
      amount,
      currency: body.currency ?? "EUR",
      note: body.note ?? null,
    })
    .returning();

  return NextResponse.json(result[0], { status: 201 });
}

/**
 * PATCH /api/operations  — update an existing operation.
 * Body: { id, ...fields }
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (updates.type && !VALID_TYPES.has(updates.type)) {
    return NextResponse.json({ error: `invalid type: ${updates.type}` }, { status: 400 });
  }
  if (updates.date && !/^\d{4}-\d{2}-\d{2}$/.test(updates.date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const result = await db
    .update(schema.operations)
    .set({ ...updates, updated_at: new Date().toISOString() })
    .where(eq(schema.operations.id, id))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(result[0]);
}

/**
 * DELETE /api/operations?id=<id>
 */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const result = await db
    .delete(schema.operations)
    .where(eq(schema.operations.id, parseInt(id)))
    .returning();
  if (result.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, deleted: result[0] });
}
