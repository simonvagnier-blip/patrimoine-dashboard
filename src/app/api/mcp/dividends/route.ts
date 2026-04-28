import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { computeDividendSummary } from "@/lib/dividend-summary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;
  const data = await computeDividendSummary();
  return NextResponse.json(data);
}
