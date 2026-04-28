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

  // Fetch EUR/USD rate via chart() as well
  let eurUsd = 1.08;
  try {
    const fx = await fetchOneViaChart("EURUSD=X");
    if (fx && fx.price > 0) eurUsd = fx.price;
  } catch {
    console.warn("Failed to fetch EUR/USD rate, using fallback");
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

  const data: QuotesResult = {
    quotes,
    eurUsd,
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
