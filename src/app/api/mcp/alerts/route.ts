import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { evaluateAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;

  const data = await evaluateAlerts();
  const triggeredOnly = request.nextUrl.searchParams.get("triggered_only") === "true";
  const alerts = triggeredOnly ? data.alerts.filter((a) => a.triggered) : data.alerts;
  return NextResponse.json({
    fetched_at: data.fetched_at,
    total_count: data.alerts.length,
    triggered_count: data.alerts.filter((a) => a.triggered).length,
    alerts,
  });
}
