import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { loadPortfolioState } from "@/lib/portfolio-state";
import { db, schema } from "@/lib/db";
import {
  runSimulation,
  computeWeightedReturn,
  type SimulationInput,
} from "@/lib/simulation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;

  const horizonParam = request.nextUrl.searchParams.get("horizon_years");
  const horizonYears = horizonParam ? Math.min(60, Math.max(1, parseInt(horizonParam))) : 30;

  // Load enriched portfolio state, scenario params, and user params.
  const [state, scenarioParams, userParams] = await Promise.all([
    loadPortfolioState(),
    db.select().from(schema.scenarioParams).all(),
    db.select().from(schema.userParams).all(),
  ]);

  const userParamMap = new Map(userParams.map((u) => [u.key, u.value]));
  const currentAge = parseInt(userParamMap.get("currentAge") || "32");
  const retireAge = parseInt(userParamMap.get("retireAge") || "64");
  // perContrib : voir commentaire dans lib/what-if.ts — la contrib PER est
  // stockée sur envelopes.annual_contrib du PER, pas dans userParams.
  const perEnv = state.envelopes.find((e) => e.id === "per");
  const perContribParam = parseInt(userParamMap.get("perContrib") || "0");
  const perContrib = perContribParam > 0
    ? perContribParam
    : (perEnv?.annual_contrib ?? 0);
  const peaVersementsRaw = userParamMap.get("peaVersements");
  const peaVersementsCumules = peaVersementsRaw
    ? parseFloat(peaVersementsRaw)
    : null;

  // Compose simulation input per envelope with weighted returns.
  const envelopes = state.envelopes.map((env) => {
    const envPositions = state.positions
      .filter((p) => p.envelope_id === env.id)
      .map((p) => ({
        scenario_key: p.scenario_key,
        value: p.current_value_eur,
      }));
    const currentValue = envPositions.reduce((s, p) => s + p.value, 0);
    const returns = computeWeightedReturn(
      envPositions,
      scenarioParams,
      currentValue
    );
    return {
      id: env.id,
      name: env.name,
      color: env.color,
      currentValue,
      type: env.type,
      target: env.target,
      fill_end_year: env.fill_end_year,
      annual_contrib: env.id === "per" ? perContrib : env.annual_contrib,
      returns,
      // PEA cap : versements cumulés du profil fiscal (ou fallback cost_basis
      // via env.deposits_eur exposé par portfolio-state).
      versements_cumules_eur:
        env.type === "pea"
          ? (peaVersementsCumules ?? env.deposits_eur ?? undefined)
          : undefined,
      // Série invested[] démarre du capital réellement investi (cost basis +
      // manual_value), pas de la valeur marché.
      initial_invested_eur: env.initial_invested_eur,
    };
  });

  const input: SimulationInput = {
    envelopes,
    currentAge,
    retireAge,
    horizonYears,
  };

  const results = runSimulation(input);

  // Slim down the output: per scenario, return totals and invested at key horizons.
  const keyHorizons = [1, 5, 10, 15, 20, 25, 30].filter((h) => h <= horizonYears);

  const scenarios = results.map((r) => ({
    key: r.scenario,
    label: r.label,
    weighted_returns_pct: envelopes.reduce((acc, env) => {
      acc[env.id] = env.returns[r.scenario];
      return acc;
    }, {} as Record<string, number>),
    totals_by_year: r.totals.map((v) => Math.round(v)),
    invested_by_year: r.invested.map((v) => Math.round(v)),
    key_horizons: keyHorizons.map((h) => ({
      years_from_now: h,
      age: currentAge + h,
      total_eur: Math.round(r.totals[h]),
      invested_eur: Math.round(r.invested[h]),
      gain_eur: Math.round(r.totals[h] - r.invested[h]),
    })),
  }));

  return NextResponse.json({
    fetched_at: state.fetched_at,
    current_age: currentAge,
    retire_age: retireAge,
    per_annual_contrib_eur: perContrib,
    horizon_years: horizonYears,
    scenario_params: scenarioParams,
    envelope_inputs: envelopes.map((e) => ({
      id: e.id,
      name: e.name,
      current_value_eur: Math.round(e.currentValue),
      weighted_annual_returns_pct: e.returns,
    })),
    scenarios,
  });
}
