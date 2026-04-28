/**
 * Types partagés entre client et serveur pour les dividendes.
 * Aucune dépendance runtime — importable depuis les composants client.
 */

export interface DividendInfo {
  ticker: string;
  currency: string;
  yield_pct: number | null;
  annual_rate: number | null;
  last_amount: number | null;
  last_ex_date: string | null;
  last_pay_date: string | null;
  next_ex_date: string | null;
  next_pay_date: string | null;
  next_amount_estimate: number | null;
  past_12m_total: number | null;
  payment_count_12m: number;
  frequency_per_year: number | null;
}

export interface PositionDividend {
  position_id: number;
  envelope_id: string;
  envelope_name: string;
  ticker: string;
  yahoo_ticker: string | null;
  label: string;
  quantity: number | null;
  currency: string;
  yield_pct: number | null;
  annual_per_share_local: number | null;
  annual_total_local: number | null;
  annual_total_eur: number | null;
  next_ex_date: string | null;
  next_pay_date: string | null;
  next_amount_per_share_local: number | null;
  next_amount_total_eur: number | null;
  past_12m_per_share_local: number | null;
  past_12m_total_eur: number | null;
  frequency_per_year: number | null;
}

export interface DividendSummary {
  fetched_at: string;
  eur_usd: number;
  positions: PositionDividend[];
  total_expected_annual_eur: number;
  total_received_ytd_eur: number;
  upcoming_30d: Array<{
    ticker: string;
    label: string;
    ex_date: string;
    estimated_amount_eur: number;
  }>;
}
