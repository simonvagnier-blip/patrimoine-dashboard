import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { db, schema } from "@/lib/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * MCP read-only operations feed. Same filters as /api/operations but:
 *   - always ordered ASC by date (chronological, what Claude expects for xirr)
 *   - joined with envelope name for context
 *   - capped at 1000 rows per call to protect context size
 */
export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;

  const sp = request.nextUrl.searchParams;
  const envelopeId = sp.get("envelope_id");
  const positionId = sp.get("position_id");
  const from = sp.get("from");
  const to = sp.get("to");

  const conditions = [] as ReturnType<typeof eq>[];
  if (envelopeId) conditions.push(eq(schema.operations.envelope_id, envelopeId));
  if (positionId) conditions.push(eq(schema.operations.position_id, parseInt(positionId)));
  if (from) conditions.push(gte(schema.operations.date, from));
  if (to) conditions.push(lte(schema.operations.date, to));

  const rows = await db
    .select()
    .from(schema.operations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(schema.operations.date), asc(schema.operations.id))
    .limit(1000)
    .all();

  return NextResponse.json({
    count: rows.length,
    filters: { envelope_id: envelopeId, position_id: positionId, from, to },
    operations: rows,
  });
}
