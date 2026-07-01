/**
 * TWR (Time-Weighted Rate of Return) — rendement pondéré dans le temps.
 *
 * Méthode « true TWR » (standard GIPS) : on chaîne géométriquement les
 * rendements journaliers calculés entre deux valorisations consécutives,
 * en neutralisant les flux externes du jour :
 *
 *   r_t = V_t / (V_{t-1} + C_t) − 1     (convention « début de journée » :
 *                                        l'apport C_t travaille le jour même)
 *   TWR = Π(1 + r_t) − 1
 *
 * Contrairement au TRI (xirr, money-weighted), le TWR ne dépend PAS du
 * timing ni de la taille des apports → c'est la SEULE métrique honnêtement
 * comparable à un indice. L'écart TRI − TWR mesure l'effet du timing des
 * versements.
 *
 * Flux externes au niveau enveloppe : mêmes conventions que la « perf marché
 * pure » existante (computeEnvelopeDeltas) — buy/deposit = +|amount|,
 * sell/withdrawal = −|amount| ; dividendes/intérêts/frais = performance,
 * pas des flux. Les montants USD/MGA sont convertis au taux du jour de
 * calcul (le taux historique n'est pas stocké — approximation documentée,
 * identique au reste de l'app).
 */

export interface DailyValue {
  date: string; // YYYY-MM-DD
  value: number; // EUR
}

export interface TwrResult {
  /** TWR cumulé sur la période (ex: 0.083 = +8,3 %). */
  twr: number | null;
  /** TWR annualisé — null si période < 90 j (annualiser du bruit court = mensonge). */
  twr_annualized: number | null;
  /** Série cumulée pour graphe : pct = TWR cumulé en % à cette date (base 0). */
  series: Array<{ date: string; pct: number }>;
  days: number;
  first_date: string | null;
  last_date: string | null;
  /** Sous-périodes ignorées (dénominateur ≤ 0 — compte vidé/re-crédité). */
  skipped_segments: number;
}

/**
 * Chaîne le TWR sur une série de valorisations quotidiennes (triée ou non)
 * et une map de flux externes par date (EUR, + = argent qui ENTRE).
 * Les jours sans snapshot sont simplement des sous-périodes plus longues :
 * les flux des jours intermédiaires sont agrégés dans la sous-période.
 */
export function chainTwr(
  values: DailyValue[],
  flowsByDate: Record<string, number>
): TwrResult {
  const pts = [...values]
    .filter((v) => Number.isFinite(v.value) && v.value >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (pts.length < 2) {
    return { twr: null, twr_annualized: null, series: [], days: 0, first_date: null, last_date: null, skipped_segments: 0 };
  }

  // Dates de flux triées pour agréger ceux qui tombent entre deux snapshots.
  const flowDates = Object.keys(flowsByDate).sort();

  let cum = 1;
  let skipped = 0;
  const series: Array<{ date: string; pct: number }> = [
    { date: pts[0].date, pct: 0 },
  ];

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    // Flux externes strictement après prev.date et jusqu'à cur.date incluse.
    let flow = 0;
    for (const d of flowDates) {
      if (d > prev.date && d <= cur.date) flow += flowsByDate[d];
      if (d > cur.date) break;
    }
    const denom = prev.value + flow;
    if (denom <= 0) {
      // Compte vidé / données incohérentes : on saute la sous-période sans
      // casser toute la chaîne (repart de la valeur suivante).
      skipped++;
      series.push({ date: cur.date, pct: (cum - 1) * 100 });
      continue;
    }
    const r = cur.value / denom - 1;
    cum *= 1 + r;
    series.push({ date: cur.date, pct: (cum - 1) * 100 });
  }

  const first = pts[0].date;
  const last = pts[pts.length - 1].date;
  const days = Math.round(
    (Date.parse(last) - Date.parse(first)) / 86400000
  );
  const twr = cum - 1;
  const twr_annualized =
    days >= 90 ? Math.pow(1 + twr, 365 / days) - 1 : null;

  return {
    twr,
    twr_annualized,
    series,
    days,
    first_date: first,
    last_date: last,
    skipped_segments: skipped,
  };
}

/**
 * Agrège les opérations d'une enveloppe en flux externes par date (EUR).
 * buy/deposit = +|amount| ; sell/withdrawal = −|amount| ; le reste = perf.
 */
export function flowsFromOperations(
  ops: Array<{ date: string; type: string; amount: number; currency: string }>,
  convertToEur: (amount: number, currency: string) => number
): Record<string, number> {
  const flows: Record<string, number> = {};
  for (const op of ops) {
    const eur = Math.abs(convertToEur(op.amount, op.currency));
    let signed = 0;
    if (op.type === "buy" || op.type === "deposit") signed = eur;
    else if (op.type === "sell" || op.type === "withdrawal") signed = -eur;
    else continue;
    flows[op.date] = (flows[op.date] ?? 0) + signed;
  }
  return flows;
}
