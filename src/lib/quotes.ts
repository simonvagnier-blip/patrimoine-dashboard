// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export interface Quote {
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  name: string;
}

export interface QuotesResult {
  quotes: Record<string, Quote>;
  eurUsd: number;
  /**
   * Taux MGA → EUR (1 EUR = X MGA). Lu depuis userParams.mga_eur_rate,
   * mis à jour manuellement par l'utilisateur. Utilisé pour la conversion
   * des positions à valeur manuelle en MGA (business Madagascar).
   */
  mgaEurRate: number;
  fetchedAt: string;
}

// In-memory cache
let cache: QuotesResult | null = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function getCachedQuotes(): QuotesResult | null {
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return cache;
  }
  return null;
}

// Fetch a single quote via the chart() API.
// We use chart() instead of quote() because quote() intermittently fails on
// Vercel serverless due to crumb/cookie handling, while chart() is reliable.
async function fetchOneViaChart(ticker: string): Promise<Quote | null> {
  try {
    const result = await yahooFinance.chart(ticker, {
      period1: new Date(Date.now() - 7 * 86400000),
      period2: new Date(),
      interval: "1d",
    });
    const meta = (result?.meta ?? {}) as Record<string, unknown>;
    const price = meta.regularMarketPrice as number | undefined;
    if (typeof price !== "number") return null;
    const prevClose = (meta.chartPreviousClose as number | undefined) ?? price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return {
      price,
      currency: (meta.currency as string) ?? "EUR",
      change,
      changePercent,
      name:
        (meta.shortName as string) ??
        (meta.longName as string) ??
        (meta.symbol as string) ??
        ticker,
    };
  } catch (err) {
    console.error(`chart() failed for ${ticker}:`, (err as Error).message);
    return null;
  }
}

export async function fetchAllQuotes(
  yahooTickers: string[]
): Promise<QuotesResult> {
  const cached = getCachedQuotes();
  if (cached) return cached;

  const quotes: Record<string, Quote> = {};
  const uniqueTickers = [...new Set(yahooTickers.filter(Boolean))];

  // Fetch FX rates : source primaire = open.er-api.com (gratuit, sans clé,
  // données quotidiennes basées sur les banques centrales, plus stable que
  // Yahoo sur les paires émergentes comme MGA). Fallback Yahoo si l'API est
  // down. Fallback hardcodé en dernier recours.
  let eurUsd = 1.08;
  let mgaEurRateLive: number | null = null;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR", {
      next: { revalidate: 3600 }, // cache Next.js 1h, par-dessus notre cache 15min
    });
    if (res.ok) {
      const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (data.result === "success" && data.rates) {
        if (typeof data.rates.USD === "number" && data.rates.USD > 0) {
          eurUsd = data.rates.USD;
        }
        if (typeof data.rates.MGA === "number" && data.rates.MGA > 0) {
          mgaEurRateLive = data.rates.MGA;
        }
      }
    }
  } catch {
    console.warn("open.er-api.com indispo, fallback Yahoo");
  }
  // Fallback Yahoo si une des deux rates n'a pas été obtenue
  if (mgaEurRateLive === null || eurUsd === 1.08) {
    try {
      const [fxUsd, fxMga] = await Promise.allSettled([
        eurUsd === 1.08 ? fetchOneViaChart("EURUSD=X") : Promise.resolve(null),
        mgaEurRateLive === null ? fetchOneViaChart("EURMGA=X") : Promise.resolve(null),
      ]);
      if (fxUsd.status === "fulfilled" && fxUsd.value && fxUsd.value.price > 0 && eurUsd === 1.08) {
        eurUsd = fxUsd.value.price;
      }
      if (fxMga.status === "fulfilled" && fxMga.value && fxMga.value.price > 0 && mgaEurRateLive === null) {
        mgaEurRateLive = fxMga.value.price;
      }
    } catch {
      // tant pis
    }
  }

  // Parallel batches
  const batchSize = 5;
  for (let i = 0; i < uniqueTickers.length; i += batchSize) {
    const batch = uniqueTickers.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (ticker) => ({ ticker, q: await fetchOneViaChart(ticker) }))
    );
    for (const res of results) {
      if (res.status === "fulfilled" && res.value.q) {
        quotes[res.value.ticker] = res.value.q;
      }
    }
  }

  // Taux MGA→EUR : Yahoo live (EURMGA=X) si dispo, sinon fallback 4800.
  // Yahoo expose le cours EUR/MGA mis à jour quotidiennement (paire flottante,
  // pas spéculative — légèrement moins fluide que les majors mais fiable).
  const mgaEurRate = mgaEurRateLive ?? 4800;

  const data: QuotesResult = {
    quotes,
    eurUsd,
    mgaEurRate,
    fetchedAt: new Date().toISOString(),
  };

  cache = data;
  cacheTime = Date.now();

  return data;
}

export function invalidateCache() {
  cache = null;
  cacheTime = 0;
}
