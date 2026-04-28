import { db, schema } from "@/lib/db";
import { loadPortfolioState } from "@/lib/portfolio-state";
import { getDividendInfo } from "@/lib/dividends";
import type {
  DividendSummary,
  PositionDividend,
} from "@/lib/dividends-types";

export type { DividendSummary, PositionDividend };

/**
 * Aggrège pour le portefeuille entier :
 *   - Le dividende annuel projeté par position (rate × qty), converti EUR
 *   - Le total annuel projeté (somme)
 *   - Les dividendes RÉELLEMENT reçus depuis le journal d'opérations
 *     (type='dividend' ou 'interest'), filtré sur l'année en cours par défaut
 *   - Les prochains détachements dans les 30 prochains jours
 *
 * Utilisé par /api/dividends/summary et le widget dashboard.
 */

export async function computeDividendSummary(): Promise<DividendSummary> {
  const state = await loadPortfolioState();
  const eurUsd = state.eur_usd;

  // Tickers avec quantité > 0 et un yahoo_ticker
  const tracked = state.positions.filter(
    (p) => p.yahoo_ticker && typeof p.quantity === "number" && p.quantity > 0
  );

  const dividendInfos = await Promise.all(
    tracked.map(async (p) => ({
      pos: p,
      info: await getDividendInfo(p.yahoo_ticker as string),
    }))
  );

  const positions: PositionDividend[] = dividendInfos.map(({ pos, info }) => {
    const qty = pos.quantity as number;
    const fxToEur = (amount: number, currency: string): number =>
      currency === "USD" ? amount / eurUsd : amount;

    const annualPerShare = info?.annual_rate ?? null;
    const annualTotalLocal =
      annualPerShare !== null ? annualPerShare * qty : null;
    const annualTotalEur =
      annualTotalLocal !== null
        ? round2(fxToEur(annualTotalLocal, info?.currency ?? pos.currency))
        : null;

    const nextAmountPerShare = info?.next_amount_estimate ?? null;
    const nextAmountTotalEur =
      nextAmountPerShare !== null
        ? round2(fxToEur(nextAmountPerShare * qty, info?.currency ?? pos.currency))
        : null;

    const past12mPerShare = info?.past_12m_total ?? null;
    const past12mTotalEur =
      past12mPerShare !== null
        ? round2(fxToEur(past12mPerShare * qty, info?.currency ?? pos.currency))
        : null;

    return {
      position_id: pos.id,
      envelope_id: pos.envelope_id,
      envelope_name: pos.envelope_name,
      ticker: pos.ticker,
      yahoo_ticker: pos.yahoo_ticker,
      label: pos.label,
      quantity: qty,
      currency: info?.currency ?? pos.currency,
      yield_pct: info?.yield_pct ?? null,
      annual_per_share_local: annualPerShare,
      annual_total_local: annualTotalLocal,
      annual_total_eur: annualTotalEur,
      next_ex_date: info?.next_ex_date ?? null,
      next_pay_date: info?.next_pay_date ?? null,
      next_amount_per_share_local: nextAmountPerShare,
      next_amount_total_eur: nextAmountTotalEur,
      past_12m_per_share_local: past12mPerShare,
      past_12m_total_eur: past12mTotalEur,
      frequency_per_year: info?.frequency_per_year ?? null,
    };
  });

  // Total annuel attendu
  const total_expected_annual_eur = round2(
    positions.reduce((s, p) => s + (p.annual_total_eur ?? 0), 0)
  );

  // Dividendes reçus YTD depuis le journal d'opérations.
  // On charge tout puis on filtre côté JS — table petite pour un utilisateur.
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ops = await db.select().from(schema.operations).all();
  const ytdDividends = ops.filter(
    (op) =>
      (op.type === "dividend" || op.type === "interest") &&
      op.date >= yearStart
  );
  // Convertir en EUR (signe négatif en DB pour cash_in → on prend abs)
  const total_received_ytd_eur = round2(
    ytdDividends.reduce((s, op) => {
      const amount = Math.abs(op.amount);
      return s + (op.currency === "USD" ? amount / eurUsd : amount);
    }, 0)
  );

  // Prochains détachements 30j
  const todayMs = Date.now();
  const thirtyDaysMs = todayMs + 30 * 86400000;
  const upcoming_30d = positions
    .filter((p) => p.next_ex_date && p.next_amount_total_eur !== null)
    .map((p) => ({
      ticker: p.ticker,
      label: p.label,
      ex_date: p.next_ex_date as string,
      estimated_amount_eur: p.next_amount_total_eur as number,
    }))
    .filter((u) => {
      const ms = new Date(u.ex_date).getTime();
      return ms >= todayMs - 86400000 && ms <= thirtyDaysMs;
    })
    .sort((a, b) => a.ex_date.localeCompare(b.ex_date));

  return {
    fetched_at: state.fetched_at,
    eur_usd: eurUsd,
    positions: positions.sort(
      (a, b) => (b.annual_total_eur ?? 0) - (a.annual_total_eur ?? 0)
    ),
    total_expected_annual_eur,
    total_received_ytd_eur,
    upcoming_30d,
  };
}

function round2(n: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
