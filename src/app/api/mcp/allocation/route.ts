import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { loadPortfolioState } from "@/lib/portfolio-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;

  const state = await loadPortfolioState();

  // By asset class (scenario_key)
  const byClass = new Map<string, number>();
  for (const p of state.positions) {
    byClass.set(
      p.scenario_key,
      (byClass.get(p.scenario_key) ?? 0) + p.current_value_eur
    );
  }
  const by_asset_class = Array.from(byClass.entries())
    .map(([asset_class, value_eur]) => ({
      asset_class,
      value_eur: round2(value_eur),
      pct: state.total_value_eur > 0
        ? round2((value_eur / state.total_value_eur) * 100, 2)
        : 0,
    }))
    .sort((a, b) => b.value_eur - a.value_eur);

  // By envelope type
  const byType = new Map<string, number>();
  for (const e of state.envelopes) {
    byType.set(e.type, (byType.get(e.type) ?? 0) + e.total_value_eur);
  }
  const by_envelope_type = Array.from(byType.entries())
    .map(([type, value_eur]) => ({
      type,
      value_eur: round2(value_eur),
      pct: state.total_value_eur > 0
        ? round2((value_eur / state.total_value_eur) * 100, 2)
        : 0,
    }))
    .sort((a, b) => b.value_eur - a.value_eur);

  // By currency (approx: USD → EUR conversion already applied in value)
  const byCurrency = new Map<string, number>();
  for (const p of state.positions) {
    byCurrency.set(
      p.currency,
      (byCurrency.get(p.currency) ?? 0) + p.current_value_eur
    );
  }
  const by_currency = Array.from(byCurrency.entries()).map(
    ([currency, value_eur]) => ({
      currency,
      value_eur: round2(value_eur),
      pct: state.total_value_eur > 0
        ? round2((value_eur / state.total_value_eur) * 100, 2)
        : 0,
    })
  );

  return NextResponse.json({
    fetched_at: state.fetched_at,
    total_value_eur: state.total_value_eur,
    by_asset_class,
    by_envelope_type,
    by_currency,
  });
}

function round2(n: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
