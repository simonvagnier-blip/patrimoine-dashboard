// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export interface Quote {
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  name: string;
  /**
   * true = cours issu du fallback "dernier cours connu" (Yahoo n'a pas
   * répondu pour ce ticker). Le prix est celui de la dernière récupération
   * réussie, la variation du jour est neutralisée à 0.
   */
  stale?: boolean;
}

export interface QuotesResult {
  quotes: Record<string, Quote>;
  eurUsd: number;
  /**
   * Taux MGA → EUR (1 EUR = X MGA). Source primaire open.er-api.com,
   * fallback Yahoo (EURMGA=X), fallback dernier taux connu, fallback 4800.
   */
  mgaEurRate: number;
  fetchedAt: string;
  /** Tickers servis depuis le dernier cours connu (Yahoo down pour eux). */
  staleTickers: string[];
  /**
   * Tickers demandés pour lesquels AUCUN prix n'existe (ni live ni stocké).
   * Toute valorisation qui les contient est sous-estimée → les snapshots
   * refusent de persister tant que cette liste n'est pas vide.
   */
  missingTickers: string[];
  /** true si missingTickers n'est pas vide (valorisation non fiable). */
  degraded: boolean;
}

// In-memory cache (par instance serverless — souvent froid sur Vercel, le
// vrai amortisseur inter-instances est le "dernier cours connu" en DB).
let cache: QuotesResult | null = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function getCachedQuotes(): QuotesResult | null {
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return cache;
  }
  return null;
}

/**
 * Dernier cours connu, persisté dans user_params (clé unique JSON).
 * C'est le filet de sécurité : si Yahoo tombe, les positions gardent leur
 * dernière valeur au lieu de retomber à 0 € (ce qui polluait le dashboard
 * ET l'historique des snapshots).
 */
const LAST_QUOTES_KEY = "lastKnownQuotes";

interface StoredQuotes {
  quotes: Record<
    string,
    { price: number; currency: string; name: string; at: string }
  >;
  eurUsd?: number;
  mgaEurRate?: number;
  at?: string;
}

async function readStoredQuotes(): Promise<StoredQuotes> {
  try {
    const row = await db
      .select()
      .from(schema.userParams)
      .where(eq(schema.userParams.key, LAST_QUOTES_KEY))
      .get();
    if (!row) return { quotes: {} };
    const parsed = JSON.parse(row.value) as StoredQuotes;
    return { ...parsed, quotes: parsed.quotes ?? {} };
  } catch {
    return { quotes: {} };
  }
}

async function writeStoredQuotes(stored: StoredQuotes): Promise<void> {
  try {
    const value = JSON.stringify(stored);
    const existing = await db
      .select()
      .from(schema.userParams)
      .where(eq(schema.userParams.key, LAST_QUOTES_KEY))
      .get();
    if (existing) {
      await db
        .update(schema.userParams)
        .set({ value })
        .where(eq(schema.userParams.key, LAST_QUOTES_KEY))
        .run();
    } else {
      await db
        .insert(schema.userParams)
        .values({ key: LAST_QUOTES_KEY, value })
        .run();
    }
  } catch (err) {
    // Le fallback ne doit jamais faire échouer la récupération des cours.
    console.error("writeStoredQuotes failed:", (err as Error).message);
  }
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
  // down. Fallback dernier taux connu, puis hardcodé en dernier recours.
  let eurUsdLive: number | null = null;
  let mgaEurRateLive: number | null = null;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR", {
      next: { revalidate: 3600 }, // cache Next.js 1h, par-dessus notre cache 15min
    });
    if (res.ok) {
      const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (data.result === "success" && data.rates) {
        if (typeof data.rates.USD === "number" && data.rates.USD > 0) {
          eurUsdLive = data.rates.USD;
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
  if (mgaEurRateLive === null || eurUsdLive === null) {
    try {
      const [fxUsd, fxMga] = await Promise.allSettled([
        eurUsdLive === null ? fetchOneViaChart("EURUSD=X") : Promise.resolve(null),
        mgaEurRateLive === null ? fetchOneViaChart("EURMGA=X") : Promise.resolve(null),
      ]);
      if (fxUsd.status === "fulfilled" && fxUsd.value && fxUsd.value.price > 0 && eurUsdLive === null) {
        eurUsdLive = fxUsd.value.price;
      }
      if (fxMga.status === "fulfilled" && fxMga.value && fxMga.value.price > 0 && mgaEurRateLive === null) {
        mgaEurRateLive = fxMga.value.price;
      }
    } catch {
      // tant pis, on retombera sur le dernier taux connu
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

  // ── Filet de sécurité "dernier cours connu" ───────────────────────────────
  const stored = await readStoredQuotes();
  const staleTickers: string[] = [];
  const missingTickers: string[] = [];
  for (const ticker of uniqueTickers) {
    if (quotes[ticker]) continue;
    const last = stored.quotes[ticker];
    if (last && last.price > 0) {
      // Yahoo n'a pas répondu → on sert le dernier cours connu, variation
      // du jour neutralisée (on ne sait pas d'où le cours a bougé).
      quotes[ticker] = {
        price: last.price,
        currency: last.currency,
        change: 0,
        changePercent: 0,
        name: last.name,
        stale: true,
      };
      staleTickers.push(ticker);
    } else {
      missingTickers.push(ticker);
    }
  }

  const eurUsd = eurUsdLive ?? stored.eurUsd ?? 1.08;
  const mgaEurRate = mgaEurRateLive ?? stored.mgaEurRate ?? 4800;

  // Persistance du "dernier cours connu" : uniquement les cours FRAIS de ce
  // fetch (les stale ne doivent pas rafraîchir leur horodatage), fusionnés
  // avec l'existant pour ne pas perdre les tickers non demandés cette fois.
  const freshCount = uniqueTickers.length - staleTickers.length - missingTickers.length;
  if (freshCount > 0 || eurUsdLive !== null || mgaEurRateLive !== null) {
    const nowIso = new Date().toISOString();
    const merged: StoredQuotes = {
      quotes: { ...stored.quotes },
      eurUsd: eurUsdLive ?? stored.eurUsd,
      mgaEurRate: mgaEurRateLive ?? stored.mgaEurRate,
      at: nowIso,
    };
    for (const [ticker, q] of Object.entries(quotes)) {
      if (q.stale) continue;
      merged.quotes[ticker] = {
        price: q.price,
        currency: q.currency,
        name: q.name,
        at: nowIso,
      };
    }
    await writeStoredQuotes(merged);
  }

  if (staleTickers.length > 0 || missingTickers.length > 0) {
    console.warn(
      `quotes dégradés — stale: [${staleTickers.join(", ")}] missing: [${missingTickers.join(", ")}]`
    );
  }

  const data: QuotesResult = {
    quotes,
    eurUsd,
    mgaEurRate,
    fetchedAt: new Date().toISOString(),
    staleTickers,
    missingTickers,
    degraded: missingTickers.length > 0,
  };

  cache = data;
  cacheTime = Date.now();

  return data;
}

export function invalidateCache() {
  cache = null;
  cacheTime = 0;
}
