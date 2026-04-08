import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const params = await db.select().from(schema.scenarioParams).all();
  return NextResponse.json(params);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  // body: { scenario, asset_class, annual_return }

  const existing = await db
    .select()
    .from(schema.scenarioParams)
    .where(
      and(
        eq(schema.scenarioParams.scenario, body.scenario),
        eq(schema.scenarioParams.asset_class, body.asset_class)
      )
    )
    .get();

  if (existing) {
    await db.update(schema.scenarioParams)
      .set({ annual_return: body.annual_return })
      .where(eq(schema.scenarioParams.id, existing.id))
      .run();
  }

  return NextResponse.json({ success: true });
}
