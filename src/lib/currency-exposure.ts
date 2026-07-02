/**
 * Exposition devise ÉCONOMIQUE (transparisation / look-through) — C7bis.
 *
 * Un ETF Amundi PEA S&P 500 se cote en EUR mais porte 100 % de risque USD ;
 * un MSCI World ~71 % USD ; un émergent surtout des devises asiatiques. Grouper
 * par devise de COTATION (ancienne version) masquait ça. Ici on décompose
 * chaque position vers les devises de ses SOUS-JACENTS.
 *
 * Méthode :
 *   - Position cotée en devise étrangère (action US en USD, actif MGA) →
 *     100 % de cette devise (exact, actif mono-devise).
 *   - Position cotée en EUR → transparisée via son scenario_key (classe
 *     d'actif) avec des poids indiciels STANDARD (approximation assumée : les
 *     compositions dérivent dans le temps, ce sont des ordres de grandeur).
 *
 * Sources des poids : compositions géographiques MSCI World / MSCI EM (~2024-26),
 * traduites en devises. À rafraîchir si les indices dérivent nettement.
 */

export type CurrencyWeights = Record<string, number>; // somme = 100

// Poids devise par classe d'actif (scenario_key) pour les positions EUR-cotées.
const LOOKTHROUGH: Record<string, CurrencyWeights> = {
  sp: { USD: 100 }, // S&P 500
  nq: { USD: 100 }, // Nasdaq-100
  // MSCI World : US 71, Japon 6, zone euro ~10, UK 4, Suisse 3, Canada 3, reste 3
  wd: { USD: 71, EUR: 10, JPY: 6, GBP: 4, CHF: 3, CAD: 3, Autres: 3 },
  // MSCI Emerging : Chine 28, Taïwan 19, Inde 18, Corée 11, Brésil 5, reste 19
  em: { CNY: 28, TWD: 19, INR: 18, KRW: 11, BRL: 5, Autres: 19 },
  tech: { USD: 100 }, // techs US (repli ; les positions réelles sont cotées USD)
  crypto: { USD: 100 }, // BTC : découverte de prix en USD
  fe: { EUR: 100 }, // fonds euros
  fg: { EUR: 100 }, // fonds garanti
  cash: { EUR: 100 },
};

export interface ExposureInput {
  currency: string; // devise de cotation
  scenarioKey: string;
  valueEur: number;
}

export interface CurrencyExposure {
  byCurrency: Array<{ currency: string; valueEur: number; pct: number }>;
  total: number;
  foreignEur: number; // tout sauf EUR
}

/** Libellés lisibles pour les devises courantes. */
export const CURRENCY_LABELS: Record<string, string> = {
  EUR: "Euro", USD: "Dollar US", JPY: "Yen", GBP: "Livre £", CHF: "Franc suisse",
  CAD: "Dollar CA", CNY: "Yuan", TWD: "Dollar TW", INR: "Roupie", KRW: "Won",
  BRL: "Réal", MGA: "Ariary", Autres: "Autres devises",
};

/**
 * Calcule l'exposition devise économique. `topN` regroupe la longue traîne
 * dans « Autres devises » pour rester lisible.
 */
export function computeCurrencyExposure(
  positions: ExposureInput[],
  topN = 8
): CurrencyExposure {
  const acc = new Map<string, number>();
  const add = (cur: string, v: number) => acc.set(cur, (acc.get(cur) ?? 0) + v);

  for (const p of positions) {
    if (p.valueEur <= 0) continue;
    if (p.currency !== "EUR") {
      // Actif mono-devise (action US, position MGA) : exact.
      add(p.currency, p.valueEur);
      continue;
    }
    const weights = LOOKTHROUGH[p.scenarioKey];
    if (!weights) {
      add("EUR", p.valueEur); // EUR-coté sans règle connue → EUR
      continue;
    }
    for (const [cur, w] of Object.entries(weights)) {
      add(cur, (p.valueEur * w) / 100);
    }
  }

  const total = [...acc.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return { byCurrency: [], total: 0, foreignEur: 0 };

  let rows = [...acc.entries()]
    .map(([currency, valueEur]) => ({ currency, valueEur, pct: (valueEur / total) * 100 }))
    .sort((a, b) => b.valueEur - a.valueEur);

  // Regroupe la traîne (au-delà de topN, ou déjà « Autres ») dans « Autres devises »
  if (rows.length > topN) {
    const keep = rows.slice(0, topN);
    const tail = rows.slice(topN);
    const tailSum = tail.reduce((s, r) => s + r.valueEur, 0);
    const existingAutres = keep.find((r) => r.currency === "Autres");
    if (existingAutres) {
      existingAutres.valueEur += tailSum;
      existingAutres.pct = (existingAutres.valueEur / total) * 100;
    } else {
      keep.push({ currency: "Autres", valueEur: tailSum, pct: (tailSum / total) * 100 });
    }
    rows = keep.sort((a, b) => b.valueEur - a.valueEur);
  } else {
    // Fusionne d'éventuelles clés « Autres » issues de plusieurs indices
    const merged = new Map<string, { currency: string; valueEur: number; pct: number }>();
    for (const r of rows) {
      const ex = merged.get(r.currency);
      if (ex) { ex.valueEur += r.valueEur; ex.pct = (ex.valueEur / total) * 100; }
      else merged.set(r.currency, { ...r });
    }
    rows = [...merged.values()].sort((a, b) => b.valueEur - a.valueEur);
  }

  const foreignEur = rows.filter((r) => r.currency !== "EUR").reduce((s, r) => s + r.valueEur, 0);
  return { byCurrency: rows, total, foreignEur };
}
