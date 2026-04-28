import { db, schema } from "@/lib/db";
import { loadPortfolioState } from "@/lib/portfolio-state";

/**
 * LOT 1b — Computation of the true annualized return (TRI / xirr) from the
 * operations journal plus the current market value.
 *
 * Cashflow sign conventions:
 *   - DB `operations.amount` is stored from the envelope's perspective:
 *       deposit / buy / fee  → POSITIVE  (money flowing INTO the envelope)
 *       dividend / sell / interest / withdrawal → NEGATIVE
 *   - `xirr` expects the INVESTOR perspective:
 *       money out of investor's pocket → NEGATIVE
 *       money back to investor         → POSITIVE
 *   → we simply flip the sign (`xirr_cf = -db_amount`).
 *
 * The "terminal cashflow" is the current market value of the position /
 * envelope / portfolio converted to EUR, dated today. It is modeled as if
 * the investor liquidated everything right now → POSITIVE for xirr.
 *
 * FX: we use today's EUR/USD for USD-denominated operations. Using the
 * historical FX on each operation's date would be more accurate but we
 * don't store it — acceptable approximation for medium horizons.
 */

export interface CashFlow {
  date: Date;
  amount: number; // in EUR, investor-centric sign
}

/**
 * Classic Newton-Raphson implementation of xirr. Returns the annualized
 * rate (e.g. 0.084 for +8.4% / year) or null if it fails to converge.
 */
export function xirr(
  flows: CashFlow[],
  guess = 0.1,
  maxIter = 100,
  tol = 1e-7
): number | null {
  if (flows.length < 2) return null;
  // xirr is only defined when flows contain at least one positive and one
  // negative cashflow. Otherwise no root exists.
  const hasPositive = flows.some((f) => f.amount > 0);
  const hasNegative = flows.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const t0 = flows[0].date.getTime();
  const YEAR_MS = 365.25 * 86400000;

  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    // NPV and its derivative w.r.t. rate
    let n = 0;
    let d = 0;
    for (const cf of flows) {
      const years = (cf.date.getTime() - t0) / YEAR_MS;
      const disc = Math.pow(1 + rate, years);
      n += cf.amount / disc;
      d += -years * cf.amount / Math.pow(1 + rate, years + 1);
    }
    if (Math.abs(n) < tol) return rate;
    if (d === 0) return null;
    const newRate = rate - n / d;
    if (Math.abs(newRate - rate) < tol) return newRate;
    rate = newRate;
    // clamp to avoid divergence to -1 (1+rate = 0)
    if (rate < -0.9999) rate = -0.9999;
    if (rate > 10) rate = 10;
  }
  return null;
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export interface ReturnRow {
  scope: "global" | "envelope" | "position";
  envelope_id?: string;
  envelope_name?: string;
  position_id?: number;
  position_label?: string;
  ticker?: string;
  current_value_eur: number;
  cashflow_count: number;
  first_flow_date: string | null;
  invested_net_eur: number; // sum of cash_out - sum of cash_in (investor perspective), NOT counting terminal
  tri_annual: number | null; // e.g. 0.084 = +8.4%/year
  coverage: "full" | "none" | "partial"; // whether the ops reconcile with current qty
  coverage_note?: string;
}

export interface ReturnsResult {
  fetched_at: string;
  eur_usd: number;
  global: ReturnRow;
  envelopes: ReturnRow[];
  positions: ReturnRow[];
}

/**
 * Compute TRI for each position, each envelope, and the whole portfolio.
 *
 * For USD operations we convert to EUR at today's spot rate. The terminal
 * value (current market value) is already in EUR from loadPortfolioState.
 */
export async function computeReturns(): Promise<ReturnsResult> {
  const state = await loadPortfolioState();
  const today = new Date();
  const eurUsd = state.eur_usd;

  const allOps = await db.select().from(schema.operations).all();

  function convertToEur(amount: number, currency: string): number {
    return currency === "USD" ? amount / eurUsd : amount;
  }

  function flowsFor(
    predicate: (op: (typeof allOps)[number]) => boolean,
    terminalValueEur: number
  ): CashFlow[] {
    const ops = allOps
      .filter(predicate)
      .map((op) => ({
        date: ymdToDate(op.date),
        // Flip sign: DB stores envelope-centric, xirr wants investor-centric
        amount: -convertToEur(op.amount, op.currency),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (terminalValueEur !== 0 || ops.length > 0) {
      ops.push({ date: today, amount: terminalValueEur });
    }
    return ops;
  }

  function netInvested(flows: CashFlow[]): number {
    // Exclude the terminal flow (last one, the current value) from the
    // net-invested figure. We want sum of investor's net cash commitment.
    if (flows.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < flows.length - 1; i++) {
      total -= flows[i].amount; // flip back to envelope-centric for "invested"
    }
    return total;
  }

  // Per-position TRI
  const positions: ReturnRow[] = [];
  for (const p of state.positions) {
    const flows = flowsFor((op) => op.position_id === p.id, p.current_value_eur);
    const coverage = computeCoverage(
      p.quantity,
      allOps.filter((op) => op.position_id === p.id)
    );
    positions.push({
      scope: "position",
      envelope_id: p.envelope_id,
      envelope_name: p.envelope_name,
      position_id: p.id,
      position_label: p.label,
      ticker: p.ticker,
      current_value_eur: p.current_value_eur,
      cashflow_count: Math.max(0, flows.length - 1),
      first_flow_date: flows.length > 1 ? flows[0].date.toISOString().split("T")[0] : null,
      invested_net_eur: round2(netInvested(flows)),
      tri_annual: xirr(flows),
      ...coverage,
    });
  }

  // Per-envelope TRI. We aggregate all ops for the envelope, including
  // deposits not tied to any specific position.
  const envelopes: ReturnRow[] = [];
  for (const e of state.envelopes) {
    const flows = flowsFor(
      (op) => op.envelope_id === e.id,
      e.total_value_eur
    );
    envelopes.push({
      scope: "envelope",
      envelope_id: e.id,
      envelope_name: e.name,
      current_value_eur: e.total_value_eur,
      cashflow_count: Math.max(0, flows.length - 1),
      first_flow_date: flows.length > 1 ? flows[0].date.toISOString().split("T")[0] : null,
      invested_net_eur: round2(netInvested(flows)),
      tri_annual: xirr(flows),
      coverage: "full",
    });
  }

  // Global TRI across everything
  const globalFlows = flowsFor(() => true, state.total_value_eur);
  const global: ReturnRow = {
    scope: "global",
    current_value_eur: state.total_value_eur,
    cashflow_count: Math.max(0, globalFlows.length - 1),
    first_flow_date:
      globalFlows.length > 1
        ? globalFlows[0].date.toISOString().split("T")[0]
        : null,
    invested_net_eur: round2(netInvested(globalFlows)),
    tri_annual: xirr(globalFlows),
    coverage: "full",
  };

  return {
    fetched_at: state.fetched_at,
    eur_usd: eurUsd,
    global,
    envelopes,
    positions,
  };
}

/**
 * A position has "full" operational coverage if the net quantity implied by
 * buy - sell operations matches its current recorded quantity. This helps
 * flag positions whose TRI is only partial because old purchases haven't
 * been backfilled in the journal.
 */
function computeCoverage(
  currentQty: number | null,
  ops: Array<{ type: string; quantity: number | null }>
): Pick<ReturnRow, "coverage" | "coverage_note"> {
  if (currentQty === null) return { coverage: "full" };
  const netQtyFromOps = ops.reduce((sum, op) => {
    if (op.type === "buy" && op.quantity) return sum + op.quantity;
    if (op.type === "sell" && op.quantity) return sum - op.quantity;
    return sum;
  }, 0);
  if (ops.length === 0) {
    return {
      coverage: "none",
      coverage_note: "Aucune opération enregistrée pour cette position",
    };
  }
  const diff = Math.abs(netQtyFromOps - currentQty);
  if (diff < 1e-6) return { coverage: "full" };
  return {
    coverage: "partial",
    coverage_note: `Quantité actuelle ${currentQty} ≠ quantité implicite ${netQtyFromOps.toFixed(
      4
    )} (écart ${(netQtyFromOps - currentQty).toFixed(4)})`,
  };
}

function round2(n: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
