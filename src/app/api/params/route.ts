import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const params = await db.select().from(schema.userParams).all();
  const result: Record<string, string> = {};
  for (const p of params) {
    result[p.key] = p.value;
  }
  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  const body: Record<string, string> = await request.json();

  for (const [key, value] of Object.entries(body)) {
    const existing = await db
      .select()
      .from(schema.userParams)
      .where(eq(schema.userParams.key, key))
      .get();

    if (existing) {
      await db.update(schema.userParams)
        .set({ value })
        .where(eq(schema.userParams.key, key))
        .run();
    } else {
      await db.insert(schema.userParams).values({ key, value }).run();
    }
  }

  return NextResponse.json({ success: true });
}
