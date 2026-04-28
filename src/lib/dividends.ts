/**
 * LOT 4 — Dividendes.
 *
 * Récupère via yahoo-finance2 les infos dividendes pour un ticker, en
 * s'appuyant UNIQUEMENT sur `chart()` (qui fonctionne sur Vercel serverless,
 * contrairement à `quoteSummary()` qui souffre des mêmes problèmes de crumb
 * que `quote()` et retourne des données vides en prod).
 *
 * Stratégie :
 *   - chart 12 mois avec `events: 'div'` → liste des dividendes versés
 *   - annual_rate = somme des dividendes 12m (par part)
 *   - frequency = nombre de paiements 12m (1 / 2 / 4 / 12)
 *   - next_ex_date = dernière + (365 / frequency) jours
 *   - yield = annual_rate / regularMarketPrice (depuis chart.meta)
 *
 * Cache 6h en mémoire.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

import type { DividendInfo } from "@/lib/dividends-types";
export type { DividendInfo };

const cache = new Map<string, { data: DividendInfo | null; time: number }>();
const CACHE_TTL = 6 * 3600 * 1000;

function detectFrequency(paymentCount12m: number): number | null {
  if (paymentCount12m >= 10) return 12;
  if (paymentCount12m >= 3) return 4;
  if (paymentCount12m === 2) return 2;
  if (paymentCount12m === 1) return 1;
  return null;
}

function periodDaysForFrequency(freq: number): number {
  return Math.round(365 / freq);
}

export async function getDividendInfo(
  ticker: string
): Promise<DividendInfo | null> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;

  try {
    // Single chart() call : récupère meta (price + currency) + events.dividends
    const r = (await yahooFinance.chart(ticker, {
      period1: new Date(Date.now() - 365 * 86400000),
      period2: new Date(),
      interval: "1d",
      events: "div",
    })) as {
      meta?: { regularMarketPrice?: number; currency?: string };
      events?: { dividends?: Array<{ amount?: number; date?: string }> };
    };

    const events = r.events?.dividends ?? [];
    const meta = r.meta ?? {};
    const currency = meta.currency ?? "USD";
    const currentPrice = meta.regularMarketPrice ?? null;

    let past_12m_total = 0;
    let payment_count_12m = 0;
    let last_amount: number | null = null;
    let last_ex_date: string | null = null;

    const sorted = [...events].sort(
      (a, b) =>
        new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
    );
    for (const e of events) {
      if (typeof e.amount === "number") {
        past_12m_total += e.amount;
        payment_count_12m++;
      }
    }
    if (sorted.length > 0 && typeof sorted[0].amount === "number") {
      last_amount = sorted[0].amount;
      last_ex_date = new Date(sorted[0].date as string)
        .toISOString()
        .split("T")[0];
    }

    // Pas de dividendes du tout : on retourne quand même un objet (yield 0)
    if (payment_count_12m === 0) {
      const empty: DividendInfo = {
        ticker,
        currency,
        yield_pct: 0,
        annual_rate: null,
        last_amount: null,
        last_ex_date: null,
        last_pay_date: null,
        next_ex_date: null,
        next_pay_date: null,
        next_amount_estimate: null,
        past_12m_total: null,
        payment_count_12m: 0,
        frequency_per_year: null,
      };
      cache.set(ticker, { data: empty, time: Date.now() });
      return empty;
    }

    const frequency_per_year = detectFrequency(payment_count_12m);
    const annual_rate = past_12m_total; // somme 12m = rate annuel implicite
    const yield_pct =
      currentPrice && currentPrice > 0 && annual_rate > 0
        ? annual_rate / currentPrice
        : null;

    let next_ex_date: string | null = null;
    let next_amount_estimate: number | null = null;
    if (frequency_per_year && last_ex_date) {
      const periodDays = periodDaysForFrequency(frequency_per_year);
      const lastExMs = new Date(last_ex_date).getTime();
      const todayMs = Date.now();
      // Si la dernière ex-date est dans le futur (rare mais possible), c'est elle
      next_ex_date =
        lastExMs > todayMs
          ? last_ex_date
          : new Date(lastExMs + periodDays * 86400000)
              .toISOString()
              .split("T")[0];
      next_amount_estimate = last_amount;
    }

    const info: DividendInfo = {
      ticker,
      currency,
      yield_pct,
      annual_rate,
      last_amount,
      last_ex_date,
      last_pay_date: null, // pas dispo via chart
      next_ex_date,
      next_pay_date: null,
      next_amount_estimate,
      past_12m_total: round4(past_12m_total),
      payment_count_12m,
      frequency_per_year,
    };
    cache.set(ticker, { data: info, time: Date.now() });
    return info;
  } catch (err) {
    console.error(
      `getDividendInfo(${ticker}) failed:`,
      (err as Error).message
    );
    cache.set(ticker, { data: null, time: Date.now() });
    return null;
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
