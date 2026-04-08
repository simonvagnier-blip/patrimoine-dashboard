import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(schema.budgetCategories).all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await db.insert(schema.budgetCategories).values({
    name: body.name,
    type: body.type,
    color: body.color || "#6b7280",
    budget_limit: body.budget_limit || null,
    icon: body.icon || null,
  }).returning().get();
  return NextResponse.json(result, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.color !== undefined) updates.color = body.color;
  if (body.budget_limit !== undefined) updates.budget_limit = body.budget_limit;
  if (body.icon !== undefined) updates.icon = body.icon;

  const result = await db.update(schema.budgetCategories).set(updates).where(eq(schema.budgetCategories.id, body.id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.budgetCategories).where(eq(schema.budgetCategories.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
