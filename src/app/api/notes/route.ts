import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const space = request.nextUrl.searchParams.get("space");
  if (space) {
    const rows = await db.select().from(schema.notes).where(eq(schema.notes.space, space)).all();
    return NextResponse.json(rows);
  }
  const rows = await db.select().from(schema.notes).all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();
  const result = await db.insert(schema.notes).values({
    space: body.space,
    title: body.title,
    content: body.content || "",
    type: body.type || "note",
    pinned: body.pinned || 0,
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
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.type !== undefined) updates.type = body.type;
  if (body.pinned !== undefined) updates.pinned = body.pinned;
  if (body.space !== undefined) updates.space = body.space;

  const result = await db.update(schema.notes).set(updates).where(eq(schema.notes.id, body.id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.notes).where(eq(schema.notes.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
