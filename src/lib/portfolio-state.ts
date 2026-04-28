import { db, schema } from "@/lib/db";
import { fetchAllQuotes, type QuotesResult } from "@/lib/quotes";

export interface EnrichedPosition {
  id: number;
  envelope_id: string;
  envelope_name: string;
  envelope_type: string;
  ticker: string;
  yahoo_ticker: string | null;
  label: string;
  isin: string | null;
  scenario_key: string;
  currency: string;
  quantity: number | null;
  pru: number | null;
  manual_value: number | null;
  // Live
  current_price: number | null;
  current_price_currency: string | null;
  current_value_eur: number;
  cost_basis_eur: number | null;
  pnl_eur: number | null;
  pnl_pct: number | null;
  daily_change_pct: number | null;
}

export interface EnrichedEnvelope {
  id: string;
  name: string;
  type: string;
  color: string;
  target: number | null;
  fill_end_year: number | null;
  annual_contrib: number | null;
  total_value_eur: number;
  cost_basis_eur: number | null;
  pnl_eur: number | null;
  pnl_pct: number | null;
  position_count: number;
  /**
   * Versements cumulés déclarés pour les enveloppes à plafond de dépôts (PEA).
   * Sur PEA : le plafond légal (150k€) porte sur les versements, pas sur la
   * valeur de marché. Source prioritaire : userParams.peaVersements (saisi sur
   * la page fiscal). Fallback : cost_basis_eur (somme des PRU × quantités) qui
   * approxime les versements en l'absence de dividendes réinvestis. Null pour
   * les types non concernés.
   */
  deposits_eur: number | null;
  /**
   * Capital réellement investi dans cette enveloppe (cost basis des positions
   * cotées + manual_value des positions non-cotées). Sans plus-values latentes.
   * Utilisé par la projection pour initialiser la série `invested[y]` d'une
   * façon cohérente avec le header "Investi" (alors que `total_value_eur`
   * gonfle avec les PV latentes). Pour les livrets : 0 (c'est de l'épargne,
   * pas un investissement — exclusion volontaire pour aligner sur la def
   * utilisée côté dashboard).
   */
  initial_invested_eur: number;
}

export interface PortfolioState {
  fetched_at: string;
  eur_usd: number;
  total_value_eur: number;
  invested_capital_eur: number;
  pnl_eur: number;
  pnl_pct: number;
  envelopes: EnrichedEnvelope[];
  positions: EnrichedPosition[];
  quotes: QuotesResult["quotes"];
}

/**
 * One-shot loader: pulls envelopes + positions from the DB, fetches live
 * quotes, and returns a fully enriched portfolio state in EUR.
 */
export async function loadPortfolioState(): Promise<PortfolioState> {
  const envelopeRows = await db.select().from(schema.envelopes).all();
  const positionRows = await db.select().from(schema.positions).all();
  // userParams.peaVersements est la source de vérité pour "versements cumulés
  // PEA" (saisi par l'utilisateur sur /perso/patrimoine/fiscal). On le charge
  // ici pour l'injecter dans l'envelope PEA — utilisé par l'UI (progress bar)
  // et par le MCP (pour que Claude voie le plafond restant honnête).
  const userParamsRows = await db.select().from(schema.userParams).all();
  const peaVersementsRaw = userParamsRows.find((p) => p.key === "peaVersements")?.value;
  const peaVersementsCumules = peaVersementsRaw ? parseFloat(peaVersementsRaw) : null;

  const tickers = positionRows
    .map((p) => p.yahoo_ticker)
    .filter((t): t is string => !!t);
  const { quotes, eurUsd } = await fetchAllQuotes(tickers);

  const envelopeById = new Map(envelopeRows.map((e) => [e.id, e]));

  const positions: EnrichedPosition[] = positionRows.map((p) => {
    const env = envelopeById.get(p.envelope_id);
    let current_price: number | null = null;
    let current_price_currency: string | null = null;
    let current_value_eur = 0;
    let cost_basis_eur: number | null = null;
    let pnl_eur: number | null = null;
    let pnl_pct: number | null = null;
    let daily_change_pct: number | null = null;

    if (p.yahoo_ticker && typeof p.quantity === "number") {
      const q = quotes[p.yahoo_ticker];
      if (q) {
        current_price = q.price;
        current_price_currency = q.currency;
        daily_change_pct = q.changePercent;
        const priceEur = q.currency === "USD" ? q.price / eurUsd : q.price;
        current_value_eur = p.quantity * priceEur;
        if (typeof p.pru === "number") {
          const pruEur = p.currency === "USD" ? p.pru / eurUsd : p.pru;
          cost_basis_eur = p.quantity * pruEur;
          pnl_eur = current_value_eur - cost_basis_eur;
          pnl_pct = cost_basis_eur > 0 ? (pnl_eur / cost_basis_eur) * 100 : 0;
        }
      }
    } else if (typeof p.manual_value === "number") {
      current_value_eur = p.manual_value;
    }

    return {
      id: p.id,
      envelope_id: p.envelope_id,
      envelope_name: env?.name ?? p.envelope_id,
      envelope_type: env?.type ?? "",
      ticker: p.ticker,
      yahoo_ticker: p.yahoo_ticker,
      label: p.label,
      isin: p.isin,
      scenario_key: p.scenario_key,
      currency: p.currency,
      quantity: p.quantity,
      pru: p.pru,
      manual_value: p.manual_value,
      current_price,
      current_price_currency,
      current_value_eur: round2(current_value_eur),
      cost_basis_eur: cost_basis_eur !== null ? round2(cost_basis_eur) : null,
      pnl_eur: pnl_eur !== null ? round2(pnl_eur) : null,
      pnl_pct: pnl_pct !== null ? round2(pnl_pct, 2) : null,
      daily_change_pct:
        daily_change_pct !== null ? round2(daily_change_pct, 2) : null,
    };
  });

  const envelopes: EnrichedEnvelope[] = envelopeRows.map((e) => {
    const envPositions = positions.filter((p) => p.envelope_id === e.id);
    const total_value_eur = envPositions.reduce(
      (s, p) => s + p.current_value_eur,
      0
    );
    const costBasisSum = envPositions.reduce(
      (s, p) => (p.cost_basis_eur !== null ? s + p.cost_basis_eur : s),
      0
    );
    const hasCost = envPositions.some((p) => p.cost_basis_eur !== null);
    const pnl_eur = hasCost
      ? envPositions.reduce((s, p) => s + (p.pnl_eur ?? 0), 0)
      : null;
    const pnl_pct =
      pnl_eur !== null && costBasisSum > 0 ? (pnl_eur / costBasisSum) * 100 : null;
    // Versements cumulés : actuellement seul le PEA en a besoin (plafond 150k€
    // sur les dépôts). Priorité au param manuel (fiscal profile), fallback
    // cost_basis sinon (bonne approximation tant qu'il n'y a pas de dividendes
    // réinvestis non-tracés).
    let deposits_eur: number | null = null;
    if (e.type === "pea") {
      if (peaVersementsCumules !== null) {
        deposits_eur = peaVersementsCumules;
      } else if (hasCost) {
        deposits_eur = round2(costBasisSum);
      }
    }
    // Capital investi initial : cost_basis + somme des manual_value des
    // positions non-cotées (fonds euros). Exclut les livrets (épargne).
    // Utilisé par la sim pour la série invested[] (sans PV latentes).
    let initial_invested_eur = 0;
    if (e.type !== "livrets") {
      initial_invested_eur = costBasisSum;
      for (const p of envPositions) {
        if (p.cost_basis_eur === null && p.manual_value !== null) {
          initial_invested_eur += p.manual_value;
        }
      }
    }
    return {
      id: e.id,
      name: e.name,
      type: e.type,
      color: e.color,
      target: e.target,
      fill_end_year: e.fill_end_year,
      annual_contrib: e.annual_contrib,
      total_value_eur: round2(total_value_eur),
      cost_basis_eur: hasCost ? round2(costBasisSum) : null,
      pnl_eur: pnl_eur !== null ? round2(pnl_eur) : null,
      pnl_pct: pnl_pct !== null ? round2(pnl_pct, 2) : null,
      position_count: envPositions.length,
      deposits_eur,
      initial_invested_eur: round2(initial_invested_eur),
    };
  });

  const total_value_eur = envelopes.reduce((s, e) => s + e.total_value_eur, 0);

  // Capital investi : toutes les positions NON-livrets. Les fonds euros /
  // valeurs manuelles sont comptés à leur manual_value (P&L implicite = 0).
  // Logique partagée avec DashboardClient et la page projections pour que les
  // chiffres soient identiques côté UI et côté API MCP.
  const livretEnvelopeIds = new Set(
    envelopeRows.filter((e) => e.type === "livrets").map((e) => e.id)
  );
  const invested_capital_eur = positions.reduce((s, p) => {
    if (livretEnvelopeIds.has(p.envelope_id)) return s;
    if (p.cost_basis_eur !== null) return s + p.cost_basis_eur;
    if (p.manual_value !== null) return s + p.manual_value;
    return s + p.current_value_eur;
  }, 0);
  const pnl_eur = positions.reduce((s, p) => s + (p.pnl_eur ?? 0), 0);
  const pnl_pct =
    invested_capital_eur > 0 ? (pnl_eur / invested_capital_eur) * 100 : 0;

  // Compute weights
  for (const p of positions) {
    (p as EnrichedPosition & { weight_pct?: number }).weight_pct =
      total_value_eur > 0
        ? round2((p.current_value_eur / total_value_eur) * 100, 2)
        : 0;
  }

  return {
    fetched_at: new Date().toISOString(),
    eur_usd: eurUsd,
    total_value_eur: round2(total_value_eur),
    invested_capital_eur: round2(invested_capital_eur),
    pnl_eur: round2(pnl_eur),
    pnl_pct: round2(pnl_pct, 2),
    envelopes,
    positions,
    quotes,
  };
}

function round2(n: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
