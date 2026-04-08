import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const space = request.nextUrl.searchParams.get("space");
  const logsFlag = request.nextUrl.searchParams.get("logs");
  const date = request.nextUrl.searchParams.get("date");

  let habits;
  if (space) {
    habits = await db.select().from(schema.habits).where(eq(schema.habits.space, space)).all();
  } else {
    habits = await db.select().from(schema.habits).all();
  }

  // If logs=true and date provided, also fetch habit_logs for that date
  if (logsFlag === "true" && date) {
    const logs = await db.select().from(schema.habitLogs).where(eq(schema.habitLogs.date, date)).all();
    return NextResponse.json({ habits, logs });
  }

  return NextResponse.json(habits);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();
  const result = await db.insert(schema.habits).values({
    space: body.space,
    name: body.name,
    icon: body.icon || null,
    color: body.color || "#34d399",
    frequency: body.frequency || "daily",
    target: body.target || 1,
    active: body.active !== undefined ? body.active : 1,
    created_at: now,
  }).returning().get();
  return NextResponse.json(result, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.color !== undefined) updates.color = body.color;
  if (body.frequency !== undefined) updates.frequency = body.frequency;
  if (body.target !== undefined) updates.target = body.target;
  if (body.active !== undefined) updates.active = body.active;
  if (body.space !== undefined) updates.space = body.space;

  const result = await db.update(schema.habits).set(updates).where(eq(schema.habits.id, body.id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.habits).where(eq(schema.habits.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
