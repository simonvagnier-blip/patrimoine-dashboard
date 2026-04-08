import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET all positions (optionally filtered by envelope_id)
export async function GET(request: NextRequest) {
  const envelopeId = request.nextUrl.searchParams.get("envelope_id");

  if (envelopeId) {
    const positions = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.envelope_id, envelopeId))
      .all();
    return NextResponse.json(positions);
  }

  const positions = await db.select().from(schema.positions).all();
  return NextResponse.json(positions);
}

// CREATE a new position
export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();

  const result = await db
    .insert(schema.positions)
    .values({
      envelope_id: body.envelope_id,
      ticker: body.ticker,
      yahoo_ticker: body.yahoo_ticker || null,
      label: body.label,
      isin: body.isin || null,
      quantity: body.quantity ?? null,
      pru: body.pru ?? null,
      manual_value: body.manual_value ?? null,
      scenario_key: body.scenario_key,
      currency: body.currency || "EUR",
      created_at: now,
      updated_at: now,
    })
    .returning()
    .get();

  return NextResponse.json(result, { status: 201 });
}

// UPDATE a position
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const result = await db
    .update(schema.positions)
    .set({
      ticker: body.ticker,
      yahoo_ticker: body.yahoo_ticker ?? undefined,
      label: body.label,
      isin: body.isin ?? undefined,
      quantity: body.quantity ?? null,
      pru: body.pru ?? null,
      manual_value: body.manual_value ?? null,
      scenario_key: body.scenario_key,
      currency: body.currency ?? undefined,
      updated_at: now,
    })
    .where(eq(schema.positions.id, body.id))
    .returning()
    .get();

  return NextResponse.json(result);
}

// DELETE a position
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await db.delete(schema.positions)
    .where(eq(schema.positions.id, parseInt(id)))
    .run();

  return NextResponse.json({ success: true });
}
