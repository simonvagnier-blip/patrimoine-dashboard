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
  }[];
  currentAge: number;
  retireAge: number;
  horizonYears: number;
}

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

        let value = env.currentValue;
        const yearValues: number[] = [value];

        for (let year = 1; year <= years; year++) {
          const projYear = currentYear + year;

          for (let month = 0; month < 12; month++) {
            // Apply monthly growth
            value *= 1 + monthlyReturn;

            // Add contributions
            if (env.type === "pea" && env.target && env.fill_end_year) {
              // PEA: monthly contributions until fill_end_year
              if (projYear <= env.fill_end_year) {
                // ~5400/month to reach 150k by end of 2027
                const monthsLeft =
                  (env.fill_end_year - currentYear) * 12;
                const remaining = Math.max(
                  0,
                  (env.target ?? 150000) - env.currentValue
                );
                const monthlyContrib =
                  monthsLeft > 0 ? remaining / monthsLeft : 0;
                value += monthlyContrib;
              }
            } else if (
              env.type === "per" &&
              env.annual_contrib &&
              input.currentAge + year <= input.retireAge
            ) {
              // PER: annual contribution spread monthly until retirement
              value += env.annual_contrib / 12;
            }
            // AV and CTO: no regular contributions
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
        let envInvested = env.currentValue;
        const projYear = currentYear + y;

        if (env.type === "pea" && env.target && env.fill_end_year) {
          const monthsLeft =
            (env.fill_end_year - currentYear) * 12;
          const remaining = Math.max(0, (env.target ?? 150000) - env.currentValue);
          const monthlyContrib = monthsLeft > 0 ? remaining / monthsLeft : 0;
          const monthsContrib = Math.min(
            y * 12,
            Math.max(0, (env.fill_end_year - currentYear) * 12)
          );
          envInvested += monthlyContrib * monthsContrib;
        } else if (
          env.type === "per" &&
          env.annual_contrib
        ) {
          const yearsContrib = Math.min(
            y,
            Math.max(0, input.retireAge - input.currentAge)
          );
          envInvested += env.annual_contrib * yearsContrib;
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
