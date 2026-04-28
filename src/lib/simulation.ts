export interface EnvelopeProjection {
  id: string;
  name: string;
  color: string;
  values: number[]; // value at each year
}

export interface ScenarioResult {
  scenario: "p" | "m" | "o";
  label: string;
  envelopes: EnvelopeProjection[];
  totals: number[]; // total at each year
  invested: number[]; // total invested at each year
}

export interface SimulationInput {
  envelopes: {
    id: string;
    name: string;
    color: string;
    currentValue: number;
    type: string;
    target: number | null;
    fill_end_year: number | null;
    annual_contrib: number | null;
    // Weighted annual return per scenario
    returns: { p: number; m: number; o: number };
    // LOT 6 — Optionnels what-if. `extra_monthly` s'ajoute à toute autre
    // contribution déjà calculée (PEA fill / PER annuel) ; `initial_boost`
    // bumpe la currentValue au temps zéro (utile pour "et si je transfère X€
    // d'un livret vers cette enveloppe").
    extra_monthly?: number;
    initial_boost?: number;
    // Versements déjà effectués (pour respecter le plafond légal sur PEA :
    // 150k€ cumulés). Si non fourni pour un PEA, on assume `currentValue`
    // comme proxy (approximation prudente).
    versements_cumules_eur?: number;
    // Capital réellement investi dans cette enveloppe (cost basis + manual
    // values, SANS plus-values latentes). Utilisé pour la série `invested[y]`
    // afin qu'elle représente "ce que tu as mis", pas "valeur marché". Les
    // livrets d'épargne passent 0 (épargne, pas investissement). Si absent,
    // fallback `currentValue` (ancien comportement, à éviter : gonfle
    // l'investi en comptant les PV latentes).
    initial_invested_eur?: number;
  }[];
  currentAge: number;
  retireAge: number;
  horizonYears: number;
}

// Plafond légal PEA — versements cumulés (lifetime)
export const PEA_DEPOSIT_CAP = 150_000;

export function runSimulation(input: SimulationInput): ScenarioResult[] {
  const scenarios: Array<{ key: "p" | "m" | "o"; label: string }> = [
    { key: "p", label: "Pessimiste" },
    { key: "m", label: "Modéré" },
    { key: "o", label: "Optimiste" },
  ];

  const currentYear = new Date().getFullYear();
  const years = input.horizonYears;

  return scenarios.map(({ key, label }) => {
    const envelopeProjections: EnvelopeProjection[] = input.envelopes.map(
      (env) => {
        const annualReturn = env.returns[key] / 100;
        const monthlyReturn = Math.pow(1 + annualReturn, 1 / 12) - 1;

        // ───── Plafond PEA (versements cumulés lifetime) ─────
        // On démarre avec les versements déjà faits (fournis par le caller
        // depuis le profil fiscal). Pour les non-PEA, on n'utilise pas ce
        // tracker.
        const isPea = env.type === "pea";
        let peaCumDeposits = isPea
          ? (env.versements_cumules_eur ?? env.currentValue)
          : 0;
        // Capacité initiale restante avant le boost
        const peaRoomInitial = isPea
          ? Math.max(0, PEA_DEPOSIT_CAP - peaCumDeposits)
          : Infinity;
        // Le boost initial est cappé pour PEA
        const initialBoostRaw = env.initial_boost ?? 0;
        const initialBoostApplied = isPea
          ? Math.min(initialBoostRaw, peaRoomInitial)
          : initialBoostRaw;
        if (isPea) peaCumDeposits += initialBoostApplied;

        let value = env.currentValue + initialBoostApplied;
        const yearValues: number[] = [value];

        for (let year = 1; year <= years; year++) {
          const projYear = currentYear + year;

          for (let month = 0; month < 12; month++) {
            // Croissance mensuelle (capitalisation)
            value *= 1 + monthlyReturn;

            // Aide locale : combien on peut encore verser (PEA only)
            const peaRoom = () =>
              isPea ? Math.max(0, PEA_DEPOSIT_CAP - peaCumDeposits) : Infinity;

            // ── PEA fill ──
            if (isPea && env.target && env.fill_end_year) {
              if (projYear <= env.fill_end_year) {
                // monthsLeft aligné sur FillTargetWidget : compte les mois
                // restants depuis le mois courant jusqu'à décembre de
                // fill_end_year. Évite de saturer le plafond en année 1
                // quand la fenêtre réelle couvre plusieurs années civiles.
                const now = new Date();
                const monthsLeft = Math.max(
                  0,
                  (env.fill_end_year - currentYear) * 12 + (11 - now.getMonth())
                );
                const remaining = Math.max(
                  0,
                  (env.target ?? PEA_DEPOSIT_CAP) - env.currentValue
                );
                const wantContrib =
                  monthsLeft > 0 ? remaining / monthsLeft : 0;
                const actual = Math.min(wantContrib, peaRoom());
                value += actual;
                peaCumDeposits += actual;
              }
            } else if (
              env.type === "per" &&
              env.annual_contrib &&
              input.currentAge + year <= input.retireAge
            ) {
              // PER : contribution annuelle mensualisée jusqu'à la retraite
              value += env.annual_contrib / 12;
            }
            // AV et CTO : pas de contribution programmée par défaut

            // LOT 6 — apport mensuel additionnel (what-if), s'ajoute. Cappé
            // pour PEA selon les versements restants.
            if (env.extra_monthly && env.extra_monthly > 0) {
              if (isPea) {
                const actual = Math.min(env.extra_monthly, peaRoom());
                value += actual;
                peaCumDeposits += actual;
              } else {
                value += env.extra_monthly;
              }
            }
          }

          yearValues.push(value);
        }

        return {
          id: env.id,
          name: env.name,
          color: env.color,
          values: yearValues,
        };
      }
    );

    // Compute totals and invested amounts
    const totals: number[] = [];
    const invested: number[] = [];

    for (let y = 0; y <= years; y++) {
      let total = 0;
      let inv = 0;

      for (let i = 0; i < input.envelopes.length; i++) {
        total += envelopeProjections[i].values[y];

        const env = input.envelopes[i];
        const isPea = env.type === "pea";

        // Capacité PEA restante (versements lifetime cappés à 150k€)
        const peaInitialDeposits = isPea
          ? (env.versements_cumules_eur ?? env.currentValue)
          : 0;
        const peaRoomInitial = isPea
          ? Math.max(0, PEA_DEPOSIT_CAP - peaInitialDeposits)
          : Infinity;
        const initialBoostRaw = env.initial_boost ?? 0;
        const initialBoostApplied = isPea
          ? Math.min(initialBoostRaw, peaRoomInitial)
          : initialBoostRaw;
        let usedRoom = isPea ? initialBoostApplied : 0;

        // Base : capital réellement investi (cost basis) + boost. Les PV
        // latentes ne sont PAS comptées (elles apparaissent dans `total[]`,
        // pas dans `invested[]`).
        const initialInvested = env.initial_invested_eur ?? env.currentValue;
        let envInvested = initialInvested + initialBoostApplied;

        if (isPea && env.target && env.fill_end_year) {
          // Mois restants jusqu'à décembre de fill_end_year (inclus) à partir
          // du mois en cours. Aligné sur la logique de FillTargetWidget pour
          // cohérence UI/sim. Avant : (fill_end_year - currentYear) × 12, qui
          // ignorait le mois courant et faisait injecter 12 mois d'apports
          // sur "l'année 1" alors que la vraie fenêtre peut être plus longue.
          const now = new Date();
          const monthsLeft = Math.max(
            0,
            (env.fill_end_year - currentYear) * 12 + (11 - now.getMonth())
          );
          const remaining = Math.max(
            0,
            (env.target ?? PEA_DEPOSIT_CAP) - env.currentValue
          );
          const monthlyContrib = monthsLeft > 0 ? remaining / monthsLeft : 0;
          const monthsContrib = Math.min(y * 12, monthsLeft);
          const wantedAdded = monthlyContrib * monthsContrib;
          const allowed = Math.min(wantedAdded, peaRoomInitial - usedRoom);
          envInvested += allowed;
          usedRoom += allowed;
        } else if (env.type === "per" && env.annual_contrib) {
          const yearsContrib = Math.min(
            y,
            Math.max(0, input.retireAge - input.currentAge)
          );
          envInvested += env.annual_contrib * yearsContrib;
        }

        // What-if : apports mensuels additionnels (cappés pour PEA)
        if (env.extra_monthly && env.extra_monthly > 0) {
          const wanted = env.extra_monthly * 12 * y;
          if (isPea) {
            const allowed = Math.min(wanted, peaRoomInitial - usedRoom);
            envInvested += allowed;
            usedRoom += allowed;
          } else {
            envInvested += wanted;
          }
        }

        inv += envInvested;
      }

      totals.push(total);
      invested.push(inv);
    }

    return { scenario: key, label, envelopes: envelopeProjections, totals, invested };
  });
}

/**
 * Compute weighted return for an envelope based on its positions
 */
export function computeWeightedReturn(
  positions: Array<{
    scenario_key: string;
    value: number;
  }>,
  scenarioParams: Array<{
    scenario: string;
    asset_class: string;
    annual_return: number;
  }>,
  totalValue: number
): { p: number; m: number; o: number } {
  const result = { p: 0, m: 0, o: 0 };
  if (totalValue <= 0) return result;

  for (const pos of positions) {
    const weight = pos.value / totalValue;
    for (const s of ["p", "m", "o"] as const) {
      const param = scenarioParams.find(
        (sp) => sp.scenario === s && sp.asset_class === pos.scenario_key
      );
      if (param) {
        result[s] += param.annual_return * weight;
      }
    }
  }

  return result;
}
