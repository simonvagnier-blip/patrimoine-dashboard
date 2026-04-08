import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const habitId = request.nextUrl.searchParams.get("habit_id");
  const startDate = request.nextUrl.searchParams.get("start");
  const endDate = request.nextUrl.searchParams.get("end");

  if (!habitId) return NextResponse.json({ error: "habit_id required" }, { status: 400 });

  const conditions = [eq(schema.habitLogs.habit_id, parseInt(habitId))];
  if (startDate) conditions.push(gte(schema.habitLogs.date, startDate));
  if (endDate) conditions.push(lte(schema.habitLogs.date, endDate));

  const logs = await db.select().from(schema.habitLogs).where(and(...conditions)).all();
  return NextResponse.json(logs);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.habit_id || !body.date) {
    return NextResponse.json({ error: "habit_id and date required" }, { status: 400 });
  }

  // Toggle logic: if log exists for this habit+date, delete it; otherwise create it
  const existing = await db.select().from(schema.habitLogs)
    .where(and(
      eq(schema.habitLogs.habit_id, body.habit_id),
      eq(schema.habitLogs.date, body.date),
    )).all();

  if (existing.length > 0) {
    await db.delete(schema.habitLogs)
      .where(and(
        eq(schema.habitLogs.habit_id, body.habit_id),
        eq(schema.habitLogs.date, body.date),
      )).run();
    return NextResponse.json({ toggled: "off", deleted: existing[0] });
  }

  const result = await db.insert(schema.habitLogs).values({
    habit_id: body.habit_id,
    date: body.date,
    count: body.count || 1,
  }).returning().get();
  return NextResponse.json({ toggled: "on", created: result }, { status: 201 });
}
