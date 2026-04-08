import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const space = request.nextUrl.searchParams.get("space");
  if (space) {
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.space, space)).all();
    return NextResponse.json(tasks);
  }
  const tasks = await db.select().from(schema.tasks).all();
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const now = new Date().toISOString();
  const result = await db.insert(schema.tasks).values({
    space: body.space,
    title: body.title,
    description: body.description || null,
    status: body.status || "todo",
    priority: body.priority || "medium",
    project_id: body.project_id || null,
    due_date: body.due_date || null,
    recurrence: body.recurrence || null,
    position: body.position || 0,
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
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) {
    updates.status = body.status;
    updates.completed_at = body.status === "done" ? now : null;
  }
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.due_date !== undefined) updates.due_date = body.due_date;
  if (body.position !== undefined) updates.position = body.position;
  if (body.project_id !== undefined) updates.project_id = body.project_id;
  if (body.recurrence !== undefined) updates.recurrence = body.recurrence;

  const result = await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, body.id)).returning().get();

  // Auto-create next occurrence when a recurring task is marked done
  if (body.status === "done" && result.recurrence) {
    const recurrenceDays: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
    const days = recurrenceDays[result.recurrence];
    if (days) {
      const baseDate = result.due_date ? new Date(result.due_date + "T00:00:00") : new Date();
      const nextDue = new Date(baseDate.getTime() + days * 86400000).toISOString().split("T")[0];
      await db.insert(schema.tasks).values({
        space: result.space,
        title: result.title,
        description: result.description || null,
        status: "todo",
        priority: result.priority,
        project_id: result.project_id,
        due_date: nextDue,
        recurrence: result.recurrence,
        position: result.position,
        created_at: now,
        updated_at: now,
      }).run();
    }
  }

  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.tasks).where(eq(schema.tasks.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
