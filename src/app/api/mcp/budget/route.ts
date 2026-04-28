import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { computeBudgetSummary } from "@/lib/budget";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;
  const monthsParam = request.nextUrl.searchParams.get("months");
  const months = monthsParam ? Math.min(60, Math.max(1, parseInt(monthsParam))) : 12;
  const data = await computeBudgetSummary(months);
  return NextResponse.json(data);
}
