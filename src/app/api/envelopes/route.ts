import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const envelopes = await db.select().from(schema.envelopes).orderBy(asc(schema.envelopes.sort_order)).all();
  return NextResponse.json(envelopes);
}

// CREATE a new envelope
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.id || !body.name || !body.type) {
    return NextResponse.json({ error: "id, name, and type are required" }, { status: 400 });
  }

  // Auto sort_order: put new envelope at the end
  const existing = await db.select().from(schema.envelopes).all();
  const maxOrder = existing.reduce((max, e) => Math.max(max, e.sort_order ?? 0), 0);

  const result = await db
    .insert(schema.envelopes)
    .values({
      id: body.id,
      name: body.name,
      type: body.type,
      color: body.color || "#6b7280",
      target: body.target ?? null,
      fill_end_year: body.fill_end_year ?? null,
      annual_contrib: body.annual_contrib ?? null,
      sort_order: maxOrder + 1,
    })
    .returning()
    .get();

  return NextResponse.json(result, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const result = await db
    .update(schema.envelopes)
    .set({
      name: body.name ?? undefined,
      type: body.type ?? undefined,
      color: body.color ?? undefined,
      target: body.target ?? undefined,
      fill_end_year: body.fill_end_year ?? undefined,
      annual_contrib: body.annual_contrib ?? undefined,
    })
    .where(eq(schema.envelopes.id, body.id))
    .returning()
    .get();

  return NextResponse.json(result);
}

// PATCH — reorder envelopes (batch update sort_order)
export async function PATCH(request: NextRequest) {
  const body: { order: { id: string; sort_order: number }[] } = await request.json();
  if (!body.order?.length) {
    return NextResponse.json({ error: "order array is required" }, { status: 400 });
  }
  for (const item of body.order) {
    await db.update(schema.envelopes)
      .set({ sort_order: item.sort_order })
      .where(eq(schema.envelopes.id, item.id))
      .run();
  }
  return NextResponse.json({ success: true });
}

// DELETE an envelope
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Delete all positions in this envelope first
  await db.delete(schema.positions)
    .where(eq(schema.positions.envelope_id, id))
    .run();

  await db.delete(schema.envelopes)
    .where(eq(schema.envelopes.id, id))
    .run();

  return NextResponse.json({ success: true });
}
