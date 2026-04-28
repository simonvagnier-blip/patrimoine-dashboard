import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { loadPortfolioState } from "@/lib/portfolio-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;

  const envelopeId = request.nextUrl.searchParams.get("envelope_id");
  const state = await loadPortfolioState();
  const positions = envelopeId
    ? state.positions.filter((p) => p.envelope_id === envelopeId)
    : state.positions;

  return NextResponse.json({
    fetched_at: state.fetched_at,
    eur_usd: state.eur_usd,
    count: positions.length,
    positions,
  });
}
