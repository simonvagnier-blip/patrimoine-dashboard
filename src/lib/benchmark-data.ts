// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

/**
 * Indices de référence — ETF UCITS CAPITALISANTS cotés en EUR :
 * le cours intègre dividendes réinvestis ET effet de change → comparaison
 * sans biais avec un portefeuille valorisé en EUR. (Les indices bruts type
 * ^GSPC sont price-return en USD : double biais.)
 */
export const BENCHMARKS: Record<string, { ticker: string; label: string }> = {
  world: { ticker: "IWDA.AS", label: "MSCI World" },
  sp500: { ticker: "SXR8.DE", label: "S&P 500" },
  nasdaq: { ticker: "SXRV.DE", label: "Nasdaq-100" },
  emerging: { ticker: "EMIM.AS", label: "MSCI Emerging" },
  btc: { ticker: "BTC-EUR", label: "Bitcoin (EUR)" },
};

/** Benchmark par défaut selon le type d'enveloppe. */
export function defaultBenchmarkFor(envelopeType: string): string {
  switch (envelopeType) {
    case "cto":
      return "sp500"; // thèses actions US
    case "crypto":
      return "btc";
    default:
      return "world"; // PEA / PER / AV : allocation majoritairement World
  }
}

export interface BenchmarkPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

// Cache mémoire 1h par (ticker, from) — les séries historiques bougent 1x/jour.
const seriesCache = new Map<string, { at: number; data: BenchmarkPoint[] }>();
const SERIES_TTL = 3600_000;

/**
 * Série quotidienne d'un benchmark depuis `fromYmd` (adjclose → gère les
 * ETF distribuants et les splits). Lève une erreur si Yahoo est down —
 * l'appelant affiche un message plutôt qu'un graphe faux.
 */
export async function fetchBenchmarkSeries(
  ticker: string,
  fromYmd: string
): Promise<BenchmarkPoint[]> {
  const key = `${ticker}:${fromYmd}`;
  const hit = seriesCache.get(key);
  if (hit && Date.now() - hit.at < SERIES_TTL) return hit.data;

  const result = await yahooFinance.chart(ticker, {
    period1: new Date(fromYmd),
    period2: new Date(),
    interval: "1d",
  });
  const quotes = (result?.quotes ?? []) as Array<{
    date: Date;
    close: number | null;
    adjclose?: number | null;
  }>;
  const data: BenchmarkPoint[] = [];
  for (const q of quotes) {
    const close = q.adjclose ?? q.close;
    if (typeof close === "number" && close > 0 && q.date) {
      data.push({ date: new Date(q.date).toISOString().slice(0, 10), close });
    }
  }
  if (data.length < 2) {
    throw new Error(`Série benchmark vide pour ${ticker}`);
  }
  seriesCache.set(key, { at: Date.now(), data });
  return data;
}
