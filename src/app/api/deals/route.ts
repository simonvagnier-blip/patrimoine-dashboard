import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const stage = request.nextUrl.searchParams.get("stage");
  if (stage) {
    const rows = await db.select().from(schema.deals).where(eq(schema.deals.stage, stage)).all();
    return NextResponse.json(rows);
  }
  const rows = await db.select().from(schema.deals).all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();
  const result = await db.insert(schema.deals).values({
    contact_id: body.contact_id || null,
    title: body.title,
    value: body.value || null,
    stage: body.stage || "lead",
    probability: body.probability || 10,
    expected_close: body.expected_close || null,
    notes: body.notes || null,
    created_at: now,
    updated_at: now,
  }).returning().get();
  return NextResponse.json(result, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (body.contact_id !== undefined) updates.contact_id = body.contact_id;
  if (body.title !== undefined) updates.title = body.title;
  if (body.value !== undefined) updates.value = body.value;
  if (body.stage !== undefined) updates.stage = body.stage;
  if (body.probability !== undefined) updates.probability = body.probability;
  if (body.expected_close !== undefined) updates.expected_close = body.expected_close;
  if (body.notes !== undefined) updates.notes = body.notes;

  const result = await db.update(schema.deals).set(updates).where(eq(schema.deals.id, body.id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.deals).where(eq(schema.deals.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
