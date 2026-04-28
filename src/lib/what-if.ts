import { db, schema } from "@/lib/db";
import { loadPortfolioState } from "@/lib/portfolio-state";
import {
  computeWeightedReturn,
  runSimulation,
  type ScenarioResult,
  type SimulationInput,
} from "@/lib/simulation";

/**
 * LOT 6 — What-if engine.
 *
 * Permet de simuler des scenarios alternatifs sans toucher la BDD :
 *   - Apports mensuels additionnels par enveloppe (extra_monthly_per_envelope)
 *   - Boost de valeur initiale par enveloppe (initial_boost_per_envelope)
 *   - Override du rendement attendu par enveloppe et par scenario
 *
 * Renvoie pour chaque scenario (P/M/O) :
 *   - Trajectoire baseline (sans modifications)
 *   - Trajectoire what-if (avec modifications appliquées)
 *   - Delta absolu et % à l'horizon, ainsi qu'à des horizons clés
 */

export interface WhatIfParams {
  horizon_years?: number; // défaut 30
  envelope_extras?: Record<
    string,
    {
      monthly_contrib?: number; // €/mois additionnels
      initial_boost?: number; // €/au temps zéro
      return_override?: { p?: number; m?: number; o?: number }; // % en décimal (e.g. 0.06 = 6%)
    }
  >;
}

export interface WhatIfScenario {
  key: "p" | "m" | "o";
  label: string;
  baseline_totals: number[];
  whatif_totals: number[];
  baseline_invested: number[];
  whatif_invested: number[];
  delta_at_horizon_eur: number;
  delta_at_horizon_pct: number;
  key_horizons: Array<{
    years_from_now: number;
    age: number;
    baseline_total_eur: number;
    whatif_total_eur: number;
    delta_eur: number;
    delta_pct: number;
  }>;
}

export interface WhatIfResult {
  fetched_at: string;
  current_age: number;
  retire_age: number;
  horizon_years: number;
  applied_changes_summary: {
    total_extra_monthly_eur: number;
    total_initial_boost_eur: number;
    overridden_return_envelopes: string[];
  };
  scenarios: WhatIfScenario[];
}

const KEY_HORIZONS_DEFAULT = [1, 5, 10, 15, 20, 25, 30];

export async function runWhatIf(params: WhatIfParams): Promise<WhatIfResult> {
  const [state, scenarioParams, userParams] = await Promise.all([
    loadPortfolioState(),
    db.select().from(schema.scenarioParams).all(),
    db.select().from(schema.userParams).all(),
  ]);
  const userParamMap = new Map(userParams.map((u) => [u.key, u.value]));
  const currentAge = parseInt(userParamMap.get("currentAge") || "32");
  const retireAge = parseInt(userParamMap.get("retireAge") || "64");
  // perContrib : la contribution PER annuelle est stockée sur la colonne
  // `envelopes.annual_contrib` du PER (source de vérité, modifiée via
  // /projections). userParams.perContrib est un legacy read — on l'accepte
  // uniquement s'il est >0, sinon fallback sur env.annual_contrib. Avant ce
  // fix, le defaut 0 dans userParams gagnait sur le vrai annual_contrib et
  // sous-estimait les baselines de ~1M€ à 30 ans vs la page client.
  const perEnv = state.envelopes.find((e) => e.id === "per");
  const perContribParam = parseInt(userParamMap.get("perContrib") || "0");
  const perContrib = perContribParam > 0
    ? perContribParam
    : (perEnv?.annual_contrib ?? 0);
  // Versements cumulés PEA : deux niveaux de fallback sont implémentés par
  // loadPortfolioState() côté envelope.deposits_eur :
  //   1. userParams.peaVersements (saisi sur /perso/patrimoine/fiscal)
  //   2. somme des cost_basis des positions PEA (approx des dépôts)
  // On se contente donc de lire env.deposits_eur ici.
  const horizonYears = Math.min(
    60,
    Math.max(1, params.horizon_years ?? 30)
  );

  const extras = params.envelope_extras ?? {};

  // Base envelopes (avec les rendements pondérés calculés depuis les positions)
  const baseEnvelopes = state.envelopes.map((env) => {
    const envPositions = state.positions
      .filter((p) => p.envelope_id === env.id)
      .map((p) => ({
        scenario_key: p.scenario_key,
        value: p.current_value_eur,
      }));
    const currentValue = envPositions.reduce((s, p) => s + p.value, 0);
    const weightedReturns = computeWeightedReturn(
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
      returns: weightedReturns,
      // PEA cap: versements cumulés fournis par portfolio-state (peaVersements
      // → cost_basis fallback). undefined pour les non-PEA.
      versements_cumules_eur: env.deposits_eur ?? undefined,
      // Série `invested[y]` : on part du capital investi, pas de la valeur
      // marché (pour éviter de compter les PV latentes comme "argent mis").
      initial_invested_eur: env.initial_invested_eur,
    };
  });

  // Baseline : tel quel
  const baselineInput: SimulationInput = {
    envelopes: baseEnvelopes,
    currentAge,
    retireAge,
    horizonYears,
  };
  const baselineResults = runSimulation(baselineInput);

  // What-if : on applique les overrides
  const whatifEnvelopes = baseEnvelopes.map((env) => {
    const ovr = extras[env.id];
    if (!ovr) return { ...env };
    const newReturns = { ...env.returns };
    if (ovr.return_override) {
      // Le SimulationInput attend les rendements en % entier (5 = 5%), pas en
      // décimal. computeWeightedReturn renvoie en %. On accepte les overrides
      // en décimal (e.g. 0.06) pour cohérence externe → on multiplie par 100.
      if (ovr.return_override.p !== undefined)
        newReturns.p = ovr.return_override.p * 100;
      if (ovr.return_override.m !== undefined)
        newReturns.m = ovr.return_override.m * 100;
      if (ovr.return_override.o !== undefined)
        newReturns.o = ovr.return_override.o * 100;
    }
    return {
      ...env,
      returns: newReturns,
      extra_monthly: ovr.monthly_contrib ?? 0,
      initial_boost: ovr.initial_boost ?? 0,
    };
  });
  const whatifInput: SimulationInput = {
    envelopes: whatifEnvelopes,
    currentAge,
    retireAge,
    horizonYears,
  };
  const whatifResults = runSimulation(whatifInput);

  // Construire résultat scenario par scenario
  const scenarios: WhatIfScenario[] = baselineResults.map(
    (baseScenario: ScenarioResult, idx: number) => {
      const wi = whatifResults[idx];
      const horizon = horizonYears;
      const baselineHorizon = baseScenario.totals[horizon] ?? 0;
      const whatifHorizon = wi.totals[horizon] ?? 0;
      const deltaEur = whatifHorizon - baselineHorizon;
      const deltaPct =
        baselineHorizon > 0 ? (deltaEur / baselineHorizon) * 100 : 0;

      const keyH = KEY_HORIZONS_DEFAULT.filter((h) => h <= horizon).map(
        (h) => {
          const b = baseScenario.totals[h] ?? 0;
          const w = wi.totals[h] ?? 0;
          return {
            years_from_now: h,
            age: currentAge + h,
            baseline_total_eur: round0(b),
            whatif_total_eur: round0(w),
            delta_eur: round0(w - b),
            delta_pct: b > 0 ? round2(((w - b) / b) * 100, 2) : 0,
          };
        }
      );

      return {
        key: baseScenario.scenario,
        label: baseScenario.label,
        baseline_totals: baseScenario.totals.map(round0),
        whatif_totals: wi.totals.map(round0),
        baseline_invested: baseScenario.invested.map(round0),
        whatif_invested: wi.invested.map(round0),
        delta_at_horizon_eur: round0(deltaEur),
        delta_at_horizon_pct: round2(deltaPct, 2),
        key_horizons: keyH,
      };
    }
  );

  // Résumé des changements appliqués
  const total_extra_monthly_eur = Object.values(extras).reduce(
    (s, e) => s + (e.monthly_contrib ?? 0),
    0
  );
  const total_initial_boost_eur = Object.values(extras).reduce(
    (s, e) => s + (e.initial_boost ?? 0),
    0
  );
  const overridden_return_envelopes = Object.entries(extras)
    .filter(([, e]) => e.return_override)
    .map(([id]) => id);

  return {
    fetched_at: state.fetched_at,
    current_age: currentAge,
    retire_age: retireAge,
    horizon_years: horizonYears,
    applied_changes_summary: {
      total_extra_monthly_eur,
      total_initial_boost_eur,
      overridden_return_envelopes,
    },
    scenarios,
  };
}

function round0(n: number): number {
  return Math.round(n);
}
function round2(n: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
