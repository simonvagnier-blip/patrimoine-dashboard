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
  /**
   * Plus-value RÉALISÉE (gains encaissés) en EUR :
   *   intérêts + dividendes perçus
   *   + plus-values de CESSION (ventes, coût moyen pondéré frais inclus).
   * Indépendant de la valeur actuelle — compte les gains même s'ils ont été
   * dépensés/sortis (ex: intérêts Madagascar ramenés en espèces).
   */
  realized_pnl_eur: number;
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
  const mgaEurRate = state.mga_eur_rate;

  const allOps = await db.select().from(schema.operations).all();

  function convertToEur(amount: number, currency: string): number {
    if (currency === "USD") return amount / eurUsd;
    if (currency === "MGA") return amount / mgaEurRate;
    return amount;
  }

  /**
   * Plus-value réalisée pour un sous-ensemble d'opérations : somme des
   * intérêts + dividendes encaissés (stockés en négatif = argent revenu à
   * l'investisseur, cf conventions ci-dessus → on inverse le signe).
   */
  function realizedPnlFor(
    predicate: (op: (typeof allOps)[number]) => boolean
  ): number {
    let total = 0;
    for (const op of allOps) {
      if (!predicate(op)) continue;
      if (op.type === "interest" || op.type === "dividend") {
        total += -convertToEur(op.amount, op.currency);
      }
    }
    return round2(total);
  }

  /**
   * Plus-values de CESSION réalisées, par position — méthode du coût moyen
   * pondéré FRAIS INCLUS (cohérente avec le PRU broker) : on rejoue le
   * journal buy/sell chronologiquement ; à chaque vente,
   *   gain = quantité_vendue × (produit_net_par_titre − coût_moyen).
   * Conversion EUR au taux du jour (même approximation FX que le xirr —
   * les taux historiques ne sont pas stockés). Les ventes non couvertes par
   * des achats journalisés sont IGNORÉES (le flag coverage le signale déjà)
   * plutôt que de compter tout le produit comme du gain.
   */
  function computeCapitalGains(): Map<number, number> {
    const byPos = new Map<number, typeof allOps>();
    for (const op of allOps) {
      if (op.position_id === null) continue;
      if (op.type !== "buy" && op.type !== "sell") continue;
      if (typeof op.quantity !== "number" || op.quantity <= 0) continue;
      const list = byPos.get(op.position_id) ?? [];
      list.push(op);
      byPos.set(op.position_id, list);
    }
    const gains = new Map<number, number>();
    for (const [pid, ops] of byPos) {
      ops.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      let qty = 0;
      let pool = 0; // coût total EUR des titres en portefeuille (frais inclus)
      let realized = 0;
      for (const op of ops) {
        const eur = Math.abs(convertToEur(op.amount, op.currency));
        if (op.type === "buy") {
          pool += eur;
          qty += op.quantity!;
        } else {
          if (qty <= 0) continue; // pas de coût connu → pas de gain compté
          const q = Math.min(op.quantity!, qty);
          const perShare = eur / op.quantity!; // produit net par titre vendu
          const avg = pool / qty;
          realized += q * (perShare - avg);
          pool -= q * avg;
          qty -= q;
        }
      }
      if (Math.abs(realized) > 0.005) gains.set(pid, realized);
    }
    return gains;
  }

  const capitalGains = computeCapitalGains();
  const envelopeByPosition = new Map(state.positions.map((p) => [p.id, p.envelope_id]));
  function capitalGainsForEnvelope(envelopeId: string): number {
    let total = 0;
    for (const [pid, g] of capitalGains) {
      if (envelopeByPosition.get(pid) === envelopeId) total += g;
    }
    return total;
  }
  const capitalGainsTotal = [...capitalGains.values()].reduce((s, g) => s + g, 0);

  // Verrou convention n°1 : le TRI/xirr se calcule sur les flux d'investissement
  // réels (buy/sell/fee) et les gains encaissés (dividend/interest) — JAMAIS sur
  // les deposit/withdrawal/transfer d'alimentation d'enveloppe. Si un deposit ET
  // les achats faits avec étaient tous deux journalisés, chaque euro serait
  // compté deux fois et le TRI serait faussé. Aujourd'hui le journal ne contient
  // aucun deposit (vérifié 07/2026) : ce filtre ne change aucun chiffre, il rend
  // la convention inviolable pour le futur.
  const XIRR_OP_TYPES = new Set(["buy", "sell", "fee", "dividend", "interest"]);

  function flowsFor(
    predicate: (op: (typeof allOps)[number]) => boolean,
    terminalValueEur: number
  ): CashFlow[] {
    const ops = allOps
      .filter((op) => XIRR_OP_TYPES.has(op.type) && predicate(op))
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
      realized_pnl_eur: round2(
        realizedPnlFor((op) => op.position_id === p.id) + (capitalGains.get(p.id) ?? 0)
      ),
      tri_annual: xirr(flows),
      ...coverage,
    });
  }

  // Per-envelope TRI. We aggregate the envelope's ops — restricted to the
  // XIRR_OP_TYPES above (deposits/withdrawals are envelope funding, not
  // investment flows; they are excluded to prevent double-counting with buys).
  const envelopes: ReturnRow[] = [];
  for (const e of state.envelopes) {
    const flows = flowsFor(
      (op) => op.envelope_id === e.id,
      e.total_value_eur
    );
    let triAnnual = xirr(flows);
    const investedNet = round2(netInvested(flows));

    // Garde-fou COVERAGE-AWARE (remplace le hardcode coverage:"full").
    // Le journal d'opérations est-il complet ? On compare le capital net
    // investi DÉCLARÉ (investedNet, depuis les cashflows journalisés) au
    // capital réellement présent (cost basis ou valeur actuelle). Si le
    // journal sous-estime largement le capital (achats anciens non
    // journalisés, ex: CTO), le TRI annualisé est un artefact → on le
    // neutralise (null → badge "TRI n/c"). Ce N'EST PAS un plafond aveugle :
    // un vrai TRI élevé avec journal qui réconcilie (ex: business Madagascar
    // 10%/mois) passe intact.
    const refCapital = Math.max(e.cost_basis_eur ?? 0, e.total_value_eur);
    let coverage: ReturnRow["coverage"] = "full";
    let coverageNote: string | undefined;
    if (refCapital > 100 && investedNet < 0.5 * refCapital) {
      coverage = "partial";
      coverageNote = `Journal incomplet : capital investi journalisé ${investedNet} € < capital réel ~${round2(refCapital)} € — TRI non fiable`;
      if (triAnnual !== null && Math.abs(triAnnual) > 1.0) triAnnual = null;
    }
    // Plafond de plausibilité pour les enveloppes NON-business : un TRI annualisé
    // |x| > 100%/an sur des actifs diversifiés (PEA/CTO/AV) n'est pas un rendement
    // soutenu mais un artefact xirr (fenêtre courte / apport récent). Les
    // enveloppes "business" (ex: Madagascar, 10%/mois) sont exemptées.
    if (e.type !== "business" && triAnnual !== null && Math.abs(triAnnual) > 1.0) {
      triAnnual = null;
    }

    envelopes.push({
      scope: "envelope",
      envelope_id: e.id,
      envelope_name: e.name,
      current_value_eur: e.total_value_eur,
      cashflow_count: Math.max(0, flows.length - 1),
      first_flow_date: flows.length > 1 ? flows[0].date.toISOString().split("T")[0] : null,
      invested_net_eur: investedNet,
      realized_pnl_eur: round2(
        realizedPnlFor((op) => op.envelope_id === e.id) + capitalGainsForEnvelope(e.id)
      ),
      tri_annual: triAnnual,
      coverage,
      coverage_note: coverageNote,
    });
  }

  // Global TRI across everything.
  // Garde-fou de plausibilité : au niveau du PORTEFEUILLE GLOBAL, un TRI
  // annualisé |x| > 100%/an n'est pas un vrai rendement soutenu mais un artefact
  // de xirr dû à un historique d'opérations incomplet (la plupart des achats
  // anciens ne sont pas journalisés, et des flux récents — ex: intérêts
  // Madagascar — sur une fenêtre courte font exploser l'annualisation). On le
  // neutralise (null → badge "TRI n/c") pour ne pas afficher un chiffre
  // trompeur. NB: on garde les TRI élevés au niveau ENVELOPPE (un deal business
  // peut réellement faire 10%/mois ≈ 214%/an).
  const globalFlows = flowsFor(() => true, state.total_value_eur);
  let globalTri = xirr(globalFlows);
  if (globalTri !== null && Math.abs(globalTri) > 1.0) globalTri = null;
  // Le flag coverage global reflète l'état réel du journal : si des enveloppes
  // sont incomplètes, le TRI global l'est aussi (avant : "full" hardcodé,
  // trompeur pour les consommateurs MCP alors que le TRI était neutralisé).
  const partialEnvelopes = envelopes.filter((e) => e.coverage !== "full");
  const global: ReturnRow = {
    scope: "global",
    current_value_eur: state.total_value_eur,
    cashflow_count: Math.max(0, globalFlows.length - 1),
    first_flow_date:
      globalFlows.length > 1
        ? globalFlows[0].date.toISOString().split("T")[0]
        : null,
    invested_net_eur: round2(netInvested(globalFlows)),
    realized_pnl_eur: round2(realizedPnlFor(() => true) + capitalGainsTotal),
    tri_annual: globalTri,
    coverage: partialEnvelopes.length === 0 ? "full" : "partial",
    coverage_note:
      partialEnvelopes.length > 0
        ? `Journal incomplet sur ${partialEnvelopes.length}/${envelopes.length} enveloppes (${partialEnvelopes
            .map((e) => e.envelope_name)
            .join(", ")}) — TRI global non fiable`
        : undefined,
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
