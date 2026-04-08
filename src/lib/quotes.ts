// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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

export async function fetchAllQuotes(
  yahooTickers: string[]
): Promise<QuotesResult> {
  // Check cache first
  const cached = getCachedQuotes();
  if (cached) return cached;

  const quotes: Record<string, Quote> = {};

  // Deduplicate tickers
  const uniqueTickers = [...new Set(yahooTickers.filter(Boolean))];

  // Fetch EUR/USD rate
  let eurUsd = 1.08; // fallback
  try {
    const fx = await yahooFinance.quote("EURUSD=X") as Record<string, unknown>;
    if (fx && typeof fx.regularMarketPrice === "number") {
      eurUsd = fx.regularMarketPrice;
    }
  } catch {
    console.warn("Failed to fetch EUR/USD rate, using fallback");
  }

  // Fetch all quotes in parallel batches
  const batchSize = 5;
  for (let i = 0; i < uniqueTickers.length; i += batchSize) {
    const batch = uniqueTickers.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (ticker) => {
        const result = await yahooFinance.quote(ticker) as Record<string, unknown>;
        return { ticker, result };
      })
    );

    for (const res of results) {
      if (res.status === "fulfilled" && res.value.result) {
        const { ticker, result } = res.value;
        quotes[ticker] = {
          price: (result.regularMarketPrice as number) ?? 0,
          currency: (result.currency as string) ?? "EUR",
          change: (result.regularMarketChange as number) ?? 0,
          changePercent: (result.regularMarketChangePercent as number) ?? 0,
          name: (result.shortName as string) ?? (result.longName as string) ?? ticker,
        };
      }
    }
  }

  const data: QuotesResult = {
    quotes,
    eurUsd,
    fetchedAt: new Date().toISOString(),
  };

  // Update cache
  cache = data;
  cacheTime = Date.now();

  return data;
}

export function invalidateCache() {
  cache = null;
  cacheTime = 0;
}
