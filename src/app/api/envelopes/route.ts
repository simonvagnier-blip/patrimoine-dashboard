import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const envelopes = await db.select().from(schema.envelopes).all();
  return NextResponse.json(envelopes);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const result = await db
    .update(schema.envelopes)
    .set({
      target: body.target ?? undefined,
      fill_end_year: body.fill_end_year ?? undefined,
      annual_contrib: body.annual_contrib ?? undefined,
    })
    .where(eq(schema.envelopes.id, body.id))
    .returning()
    .get();

  return NextResponse.json(result);
}
