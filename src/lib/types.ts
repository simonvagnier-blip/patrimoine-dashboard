export interface Envelope {
  id: string;
  name: string;
  type: "pea" | "per" | "av" | "cto";
  color: string;
  target: number | null;
  fill_end_year: number | null;
  annual_contrib: number | null;
}

export interface Position {
  id: number;
  envelope_id: string;
  ticker: string;
  yahoo_ticker: string | null;
  label: string;
  isin: string | null;
  quantity: number | null;
  pru: number | null;
  manual_value: number | null;
  scenario_key: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface ScenarioParam {
  id: number;
  scenario: "p" | "m" | "o";
  asset_class: string;
  annual_return: number;
}

export interface UserParam {
  key: string;
  value: string;
}

export interface QuoteData {
  [ticker: string]: {
    price: number;
    currency: string;
    change: number;
    changePercent: number;
  };
}

export interface PositionWithQuote extends Position {
  current_price: number | null;
  current_value: number;
  pnl: number | null;
  pnl_pct: number | null;
  weight: number;
}

export interface EnvelopeWithPositions extends Envelope {
  positions: PositionWithQuote[];
  total_value: number;
}
