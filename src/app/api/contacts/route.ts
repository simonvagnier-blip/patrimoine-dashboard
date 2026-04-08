import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(schema.contacts).all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();
  const result = await db.insert(schema.contacts).values({
    name: body.name,
    company: body.company || null,
    email: body.email || null,
    phone: body.phone || null,
    role: body.role || null,
    notes: body.notes || null,
    last_contact: body.last_contact || null,
    created_at: now,
  }).returning().get();
  return NextResponse.json(result, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.company !== undefined) updates.company = body.company;
  if (body.email !== undefined) updates.email = body.email;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.role !== undefined) updates.role = body.role;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.last_contact !== undefined) updates.last_contact = body.last_contact;

  const result = await db.update(schema.contacts).set(updates).where(eq(schema.contacts.id, body.id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.contacts).where(eq(schema.contacts.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
