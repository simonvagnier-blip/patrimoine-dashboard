import { XMLParser } from "fast-xml-parser";

/**
 * Import automatique Interactive Brokers via Flex Web Service (C5).
 *
 * Mécanisme officiel et gratuit (le même que Sharesight/Snowball) :
 *   1. SendRequest?t=TOKEN&q=QUERY_ID&v=3  → ReferenceCode
 *   2. GetStatement?t=TOKEN&q=REF&v=3      → XML complet (retry si 1019)
 *
 * Configuration (Client Portal IBKR → Performance & Reports → Flex Queries) :
 *   - Activity Flex Query avec sections : Trades (Executions), Cash
 *     Transactions, Open Positions, Change in Dividend Accruals ;
 *     format de date yyyyMMdd ; période « Last 7 calendar days »
 *   - Flex Web Service → token (durée 1 an) → env IBKR_FLEX_TOKEN
 *   - Query ID → env IBKR_FLEX_QUERY_ID
 *
 * Conventions du journal STRICTEMENT respectées :
 *   - buy  : amount POSITIF, frais inclus (qty×prix + |commission|)
 *   - sell : amount NÉGATIF, net de commission
 *   - dividend/interest : NÉGATIF = encaissé (net de retenue à la source)
 *   - fee  : POSITIF
 *   - PRU frais inclus (moyenne pondérée), aligné broker
 *   - Aucune suppression : idempotence par operations.external_id
 *   - Les Deposits & Withdrawals IBKR ne sont PAS journalisés (convention :
 *     le TRI se calcule sur buy/sell, jamais les dépôts)
 */

const FLEX_BASE =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const UA = { "User-Agent": "patrimoine-dashboard/1.0 (Node.js)" };

// ── Parsing ────────────────────────────────────────────────────────────────

export interface FlexTrade {
  tradeID: string;
  symbol: string;
  description: string;
  assetCategory: string;
  date: string; // YYYY-MM-DD
  buySell: "BUY" | "SELL";
  quantity: number; // toujours positif
  tradePrice: number;
  commission: number; // toujours positif (|ibCommission|)
  currency: string;
}

export interface FlexCash {
  transactionID: string;
  type: string;
  symbol: string | null;
  description: string;
  date: string;
  amount: number;
  currency: string;
}

export interface FlexOpenPosition {
  symbol: string;
  description: string;
  quantity: number;
  markPrice: number | null;
  positionValue: number | null;
  costBasisMoney: number | null;
  currency: string;
}

export interface FlexAccrual {
  symbol: string;
  exDate: string | null;
  payDate: string | null;
  grossRate: number | null;
  quantity: number | null;
  netAmount: number | null;
  currency: string;
  code: string;
}

export interface FlexStatementData {
  account: string | null;
  trades: FlexTrade[];
  cash: FlexCash[];
  openPositions: FlexOpenPosition[];
  accruals: FlexAccrual[];
}

function toArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

/** "20260701" | "20260701;093000" | "2026-07-01" → "2026-07-01" */
function normDate(raw: unknown): string {
  const s = String(raw ?? "").split(";")[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function num(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Parse le XML FlexQueryResponse (données en ATTRIBUTS). Fonction pure. */
export function parseFlexStatement(xml: string): FlexStatementData {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = parser.parse(xml);
  const stmt = toArray(
    doc?.FlexQueryResponse?.FlexStatements?.FlexStatement
  )[0] as Record<string, unknown> | undefined;
  if (!stmt) throw new Error("FlexStatement absent du XML");

  const trades: FlexTrade[] = [];
  for (const t of toArray((stmt.Trades as Record<string, unknown>)?.Trade) as Array<Record<string, unknown>>) {
    const qty = num(t.quantity);
    const price = num(t.tradePrice);
    const buySell = String(t.buySell ?? "").toUpperCase();
    if (!t.tradeID || qty === null || price === null) continue;
    if ((t.assetCategory ?? "STK") !== "STK") continue; // actions uniquement
    if (buySell !== "BUY" && buySell !== "SELL") continue;
    trades.push({
      tradeID: String(t.tradeID),
      symbol: String(t.symbol ?? ""),
      description: String(t.description ?? t.symbol ?? ""),
      assetCategory: String(t.assetCategory ?? "STK"),
      date: normDate(t.tradeDate),
      buySell: buySell as "BUY" | "SELL",
      quantity: Math.abs(qty),
      tradePrice: price,
      commission: Math.abs(num(t.ibCommission) ?? 0),
      currency: String(t.currency ?? "USD"),
    });
  }
  // Tri chronologique : indispensable pour un PRU moyen pondéré correct.
  trades.sort((a, b) => a.date.localeCompare(b.date) || a.tradeID.localeCompare(b.tradeID));

  const cash: FlexCash[] = [];
  for (const c of toArray((stmt.CashTransactions as Record<string, unknown>)?.CashTransaction) as Array<Record<string, unknown>>) {
    const amount = num(c.amount);
    if (amount === null) continue;
    cash.push({
      transactionID: String(c.transactionID ?? `${c.type}-${c.symbol}-${c.dateTime ?? c.reportDate}`),
      type: String(c.type ?? ""),
      symbol: c.symbol ? String(c.symbol) : null,
      description: String(c.description ?? ""),
      date: normDate(c.settleDate ?? c.reportDate ?? c.dateTime),
      amount,
      currency: String(c.currency ?? "USD"),
    });
  }

  const openPositions: FlexOpenPosition[] = [];
  for (const p of toArray((stmt.OpenPositions as Record<string, unknown>)?.OpenPosition) as Array<Record<string, unknown>>) {
    const qty = num(p.position);
    if (qty === null) continue;
    openPositions.push({
      symbol: String(p.symbol ?? ""),
      description: String(p.description ?? ""),
      quantity: qty,
      markPrice: num(p.markPrice),
      positionValue: num(p.positionValue),
      costBasisMoney: num(p.costBasisMoney),
      currency: String(p.currency ?? "USD"),
    });
  }

  const accruals: FlexAccrual[] = [];
  for (const a of toArray((stmt.ChangeInDividendAccruals as Record<string, unknown>)?.ChangeInDividendAccrual) as Array<Record<string, unknown>>) {
    accruals.push({
      symbol: String(a.symbol ?? ""),
      exDate: a.exDate ? normDate(a.exDate) : null,
      payDate: a.payDate ? normDate(a.payDate) : null,
      grossRate: num(a.grossRate),
      quantity: num(a.quantity),
      netAmount: num(a.netAmount),
      currency: String(a.currency ?? "USD"),
      code: String(a.code ?? ""),
    });
  }

  return {
    account: stmt.accountId ? String(stmt.accountId) : null,
    trades,
    cash,
    openPositions,
    accruals,
  };
}

// ── Client HTTP ────────────────────────────────────────────────────────────

async function flexFetch(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`Flex HTTP ${res.status}`);
  return res.text();
}

export async function fetchFlexStatementXml(
  token: string,
  queryId: string
): Promise<string> {
  const sendXml = await flexFetch(
    `${FLEX_BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`
  );
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const send = parser.parse(sendXml)?.FlexStatementResponse;
  if (!send || String(send.Status) !== "Success") {
    throw new Error(
      `SendRequest a échoué : ${send?.ErrorCode ?? "?"} ${send?.ErrorMessage ?? sendXml.slice(0, 200)}`
    );
  }
  const ref = String(send.ReferenceCode);
  const base = send.Url ? String(send.Url) : `${FLEX_BASE}/GetStatement`;

  // Le rapport peut mettre quelques secondes à se générer (ErrorCode 1019).
  for (let attempt = 0; attempt < 6; attempt++) {
    const xml = await flexFetch(
      `${base}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(ref)}&v=3`
    );
    if (xml.includes("<FlexQueryResponse")) return xml;
    const err = parser.parse(xml)?.FlexStatementResponse;
    const code = String(err?.ErrorCode ?? "");
    if (code === "1019" || code === "1021" || code === "1009") {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    throw new Error(`GetStatement a échoué : ${code} ${err?.ErrorMessage ?? xml.slice(0, 200)}`);
  }
  throw new Error("GetStatement : rapport toujours en génération après 6 tentatives");
}

// ── Mapping pur (testable) ─────────────────────────────────────────────────

export interface MappedOperation {
  external_id: string;
  type: "buy" | "sell" | "dividend" | "fee" | "interest";
  symbol: string | null;
  date: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  currency: string;
  note: string;
}

/** Trade IBKR → opération selon les conventions du journal. Fonction pure. */
export function mapTrade(t: FlexTrade): MappedOperation {
  const gross = t.quantity * t.tradePrice;
  if (t.buySell === "BUY") {
    return {
      external_id: `ibkr:trade:${t.tradeID}`,
      type: "buy",
      symbol: t.symbol,
      date: t.date,
      quantity: t.quantity,
      unit_price: t.tradePrice,
      amount: Math.round((gross + t.commission) * 100) / 100, // frais INCLUS
      currency: t.currency,
      note: `Import IBKR — achat ${t.symbol} (commission ${t.commission.toFixed(2)} ${t.currency})`,
    };
  }
  return {
    external_id: `ibkr:trade:${t.tradeID}`,
    type: "sell",
    symbol: t.symbol,
    date: t.date,
    quantity: t.quantity,
    unit_price: t.tradePrice,
    amount: -Math.round((gross - t.commission) * 100) / 100, // net de commission, NÉGATIF
    currency: t.currency,
    note: `Import IBKR — vente ${t.symbol} (commission ${t.commission.toFixed(2)} ${t.currency})`,
  };
}

/**
 * CashTransactions → opérations. Dividendes et retenues à la source de la
 * même (symbol, date) fusionnés en UNE op dividende NETTE. Fonction pure.
 */
export function mapCashTransactions(cash: FlexCash[]): {
  ops: MappedOperation[];
  skippedDeposits: number;
  ignored: string[];
} {
  const ops: MappedOperation[] = [];
  const ignored: string[] = [];
  let skippedDeposits = 0;

  // Fusion dividendes + withholding par (symbol, date)
  const divBuckets = new Map<string, { gross: number; tax: number; symbol: string; date: string; currency: string; ids: string[] }>();

  for (const c of cash) {
    switch (c.type) {
      case "Dividends":
      case "Payment In Lieu Of Dividends": {
        const key = `${c.symbol}:${c.date}`;
        const b = divBuckets.get(key) ?? { gross: 0, tax: 0, symbol: c.symbol ?? "?", date: c.date, currency: c.currency, ids: [] };
        b.gross += c.amount;
        b.ids.push(c.transactionID);
        divBuckets.set(key, b);
        break;
      }
      case "Withholding Tax": {
        const key = `${c.symbol}:${c.date}`;
        const b = divBuckets.get(key) ?? { gross: 0, tax: 0, symbol: c.symbol ?? "?", date: c.date, currency: c.currency, ids: [] };
        b.tax += c.amount; // négatif
        b.ids.push(c.transactionID);
        divBuckets.set(key, b);
        break;
      }
      case "Broker Interest Received":
        ops.push({
          external_id: `ibkr:cash:${c.transactionID}`,
          type: "interest",
          symbol: null,
          date: c.date,
          quantity: null,
          unit_price: null,
          amount: -Math.abs(c.amount), // encaissé = négatif
          currency: c.currency,
          note: `Import IBKR — intérêts créditeurs`,
        });
        break;
      case "Broker Interest Paid":
        ops.push({
          external_id: `ibkr:cash:${c.transactionID}`,
          type: "fee",
          symbol: null,
          date: c.date,
          quantity: null,
          unit_price: null,
          amount: Math.abs(c.amount), // coût = positif
          currency: c.currency,
          note: `Import IBKR — intérêts débiteurs`,
        });
        break;
      case "Other Fees":
      case "Commission Adjustments":
        ops.push({
          external_id: `ibkr:cash:${c.transactionID}`,
          type: "fee",
          symbol: c.symbol,
          date: c.date,
          quantity: null,
          unit_price: null,
          amount: Math.abs(c.amount),
          currency: c.currency,
          note: `Import IBKR — frais (${c.description.slice(0, 60)})`,
        });
        break;
      case "Deposits & Withdrawals":
        // Convention : les dépôts ne sont PAS journalisés (TRI sur buy/sell).
        skippedDeposits++;
        break;
      default:
        ignored.push(`${c.type} (${c.amount} ${c.currency})`);
    }
  }

  for (const b of divBuckets.values()) {
    const net = b.gross + b.tax; // tax est négatif
    if (net === 0) continue;
    ops.push({
      external_id: `ibkr:div:${b.symbol}:${b.date}`,
      type: "dividend",
      symbol: b.symbol,
      date: b.date,
      quantity: null,
      unit_price: null,
      amount: -Math.round(net * 100) / 100, // net encaissé = NÉGATIF
      currency: b.currency,
      note: `Import IBKR — dividende ${b.symbol} : brut ${b.gross.toFixed(2)}, retenue ${Math.abs(b.tax).toFixed(2)} ${b.currency} (tx ${b.ids.join(",")})`,
    });
  }

  return { ops, skippedDeposits, ignored };
}

