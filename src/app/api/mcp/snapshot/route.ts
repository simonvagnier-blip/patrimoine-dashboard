import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { loadPortfolioState } from "@/lib/portfolio-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;

  const state = await loadPortfolioState();
  // Snapshot omits the full position list — use /api/mcp/positions for that.
  return NextResponse.json({
    fetched_at: state.fetched_at,
    eur_usd: state.eur_usd,
    total_value_eur: state.total_value_eur,
    invested_capital_eur: state.invested_capital_eur,
    pnl_eur: state.pnl_eur,
    pnl_pct: state.pnl_pct,
    envelopes: state.envelopes,
  });
}
