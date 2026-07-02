import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import {
  fetchFlexStatementXml,
  mapCashTransactions,
  mapTrade,
  parseFlexStatement,
  type FlexOpenPosition,
} from "@/lib/ibkr-flex-parse";

// ── Application en base ────────────────────────────────────────────────────

export interface SyncReport {
  ok: boolean;
  configured: boolean;
  at: string;
  account?: string | null;
  imported: { buys: number; sells: number; dividends: number; fees: number; interest: number };
  skipped_existing: number;
  skipped_deposits: number;
  /** Saisies manuelles identiques reliées à leur tradeID IBKR (pas de doublon,
   *  pas de retouche de position — elle reflète déjà l'opération). */
  adopted: number;
  positions_created: string[];
  warnings: string[];
  error?: string;
}

async function upsertUserParam(key: string, value: string): Promise<void> {
  const existing = await db
    .select()
    .from(schema.userParams)
    .where(eq(schema.userParams.key, key))
    .get();
  if (existing) {
    await db.update(schema.userParams).set({ value }).where(eq(schema.userParams.key, key)).run();
  } else {
    await db.insert(schema.userParams).values({ key, value }).run();
  }
}

/** L'enveloppe IBKR = type "cto" (override possible via IBKR_ENVELOPE_ID). */
async function resolveIbkrEnvelopeId(): Promise<string | null> {
  const override = process.env.IBKR_ENVELOPE_ID;
  if (override) return override;
  const cto = await db
    .select()
    .from(schema.envelopes)
    .where(eq(schema.envelopes.type, "cto"))
    .get();
  return cto?.id ?? null;
}

export async function runIbkrSync(): Promise<SyncReport> {
  const report: SyncReport = {
    ok: false,
    configured: false,
    at: new Date().toISOString(),
    imported: { buys: 0, sells: 0, dividends: 0, fees: 0, interest: 0 },
    skipped_existing: 0,
    skipped_deposits: 0,
    adopted: 0,
    positions_created: [],
    warnings: [],
  };

  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) {
    report.error = "IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID non configurés";
    await upsertUserParam("ibkrSyncLog", JSON.stringify(report));
    return report;
  }
  report.configured = true;

  try {
    const envelopeId = await resolveIbkrEnvelopeId();
    if (!envelopeId) throw new Error("Aucune enveloppe de type cto trouvée");

    const xml = await fetchFlexStatementXml(token, queryId);
    const data = parseFlexStatement(xml);
    report.account = data.account;

    const positions = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.envelope_id, envelopeId))
      .all();
    const bySymbol = (symbol: string) =>
      positions.find((p) => p.ticker === symbol || p.yahoo_ticker === symbol);

    async function existsExternal(externalId: string): Promise<boolean> {
      const row = await db
        .select({ id: schema.operations.id })
        .from(schema.operations)
        .where(eq(schema.operations.external_id, externalId))
        .get();
      return !!row;
    }

    // ── Trades (ordre chronologique pour le PRU) ──
    for (const t of data.trades) {
      const op = mapTrade(t);
      if (await existsExternal(op.external_id)) {
        report.skipped_existing++;
        continue;
      }
      let pos = bySymbol(t.symbol);

      // ADOPTION : si Simon a déjà saisi ce trade à la main (même position,
      // date, type, quantité, montant à ±0,05 près), on relie l'op manuelle
      // au tradeID IBKR au lieu de créer un doublon. La position reflète déjà
      // ce trade → on ne touche NI quantité NI PRU. Critique pour la première
      // synchro (l'historique manuel recouvre la fenêtre de 7 jours).
      if (pos) {
        const sameDay = await db
          .select()
          .from(schema.operations)
          .where(
            and(
              eq(schema.operations.envelope_id, envelopeId),
              eq(schema.operations.position_id, pos.id),
              eq(schema.operations.date, op.date),
              eq(schema.operations.type, op.type),
            ),
          )
          .all();
        const manual = sameDay.find(
          (m) =>
            m.external_id === null &&
            Math.abs(m.amount - op.amount) < 0.05 &&
            Math.abs((m.quantity ?? 0) - (op.quantity ?? 0)) < 1e-6,
        );
        if (manual) {
          await db
            .update(schema.operations)
            .set({ external_id: op.external_id, updated_at: new Date().toISOString() })
            .where(eq(schema.operations.id, manual.id))
            .run();
          report.adopted++;
          continue;
        }
      }
      if (!pos) {
        const created = await db
          .insert(schema.positions)
          .values({
            envelope_id: envelopeId,
            ticker: t.symbol,
            yahoo_ticker: t.symbol,
            label: t.description || t.symbol,
            quantity: 0,
            pru: null,
            scenario_key: "tech", // défaut CTO — à re-classer par Simon
            currency: t.currency,
          })
          .returning();
        pos = created[0];
        positions.push(pos);
        report.positions_created.push(t.symbol);
      }

      await db.insert(schema.operations).values({
        envelope_id: envelopeId,
        position_id: pos.id,
        date: op.date,
        type: op.type,
        quantity: op.quantity,
        unit_price: op.unit_price,
        amount: op.amount,
        currency: op.currency,
        note: op.note,
        external_id: op.external_id,
      }).run();

      // Mise à jour quantité + PRU (frais inclus, moyenne pondérée)
      const q0 = pos.quantity ?? 0;
      const pru0 = pos.pru ?? 0;
      if (t.buySell === "BUY") {
        const newQty = q0 + t.quantity;
        const newPru =
          (q0 * pru0 + t.quantity * t.tradePrice + t.commission) / newQty;
        await db.update(schema.positions)
          .set({ quantity: newQty, pru: Math.round(newPru * 10000) / 10000, updated_at: new Date().toISOString() })
          .where(eq(schema.positions.id, pos.id)).run();
        pos.quantity = newQty; pos.pru = newPru;
        report.imported.buys++;
      } else {
        const newQty = Math.max(0, q0 - t.quantity);
        if (q0 - t.quantity < 0) {
          report.warnings.push(`${t.symbol} : vente de ${t.quantity} > quantité connue ${q0} — quantité plafonnée à 0, vérifie l'historique`);
        }
        await db.update(schema.positions)
          .set({ quantity: newQty, updated_at: new Date().toISOString() })
          .where(eq(schema.positions.id, pos.id)).run();
        pos.quantity = newQty;
        report.imported.sells++;
        if (newQty === 0) {
          report.warnings.push(`${t.symbol} : position soldée — renomme-la en ${t.symbol}-SOLD + label "(soldé ${op.date})" (convention)`);
        }
      }
    }

    // ── Cash : dividendes nets, frais, intérêts ──
    const { ops: cashOps, skippedDeposits, ignored } = mapCashTransactions(data.cash);
    report.skipped_deposits = skippedDeposits;
    if (ignored.length) report.warnings.push(`Types cash ignorés : ${ignored.join(" · ")}`);
    for (const op of cashOps) {
      if (await existsExternal(op.external_id)) {
        report.skipped_existing++;
        continue;
      }
      const pos = op.symbol ? bySymbol(op.symbol) : undefined;
      await db.insert(schema.operations).values({
        envelope_id: envelopeId,
        position_id: pos?.id ?? null,
        date: op.date,
        type: op.type,
        quantity: null,
        unit_price: null,
        amount: op.amount,
        currency: op.currency,
        note: op.note,
        external_id: op.external_id,
      }).run();
      if (op.type === "dividend") report.imported.dividends++;
      else if (op.type === "fee") report.imported.fees++;
      else if (op.type === "interest") report.imported.interest++;
    }

    // ── Réconciliation + dividendes annoncés → user_params ──
    await upsertUserParam(
      "ibkrReconciliation",
      JSON.stringify({ at: report.at, account: data.account, rows: data.openPositions })
    );
    await upsertUserParam(
      "ibkrDividendAccruals",
      JSON.stringify({ at: report.at, rows: data.accruals.filter((a) => a.code !== "Re") })
    );

    report.ok = true;
  } catch (err) {
    report.error = (err as Error).message;
  }

  await upsertUserParam("ibkrSyncLog", JSON.stringify(report));
  return report;
}

/**
 * Réconciliation Dashboard ↔ IBKR : compare les positions DB (enveloppe cto)
 * au dernier snapshot Open Positions importé.
 */
export async function computeReconciliation(): Promise<{
  at: string | null;
  rows: Array<{
    symbol: string;
    db_qty: number | null;
    ibkr_qty: number | null;
    qty_match: boolean;
    db_pru: number | null;
    ibkr_cost_per_share: number | null;
    ibkr_value: number | null;
    currency: string;
  }>;
}> {
  const raw = await db
    .select()
    .from(schema.userParams)
    .where(eq(schema.userParams.key, "ibkrReconciliation"))
    .get();
  if (!raw) return { at: null, rows: [] };
  const stored = JSON.parse(raw.value) as { at: string; rows: FlexOpenPosition[] };

  const envelopeId = await resolveIbkrEnvelopeId();
  const positions = envelopeId
    ? await db
        .select()
        .from(schema.positions)
        .where(and(eq(schema.positions.envelope_id, envelopeId)))
        .all()
    : [];

  const rows: Awaited<ReturnType<typeof computeReconciliation>>["rows"] = [];
  const seen = new Set<string>();

  for (const ib of stored.rows) {
    const pos = positions.find((p) => p.ticker === ib.symbol || p.yahoo_ticker === ib.symbol);
    if (pos) seen.add(String(pos.id));
    const costPerShare =
      ib.costBasisMoney !== null && ib.quantity > 0 ? ib.costBasisMoney / ib.quantity : null;
    rows.push({
      symbol: ib.symbol,
      db_qty: pos?.quantity ?? null,
      ibkr_qty: ib.quantity,
      qty_match: pos ? Math.abs((pos.quantity ?? 0) - ib.quantity) < 1e-6 : false,
      db_pru: pos?.pru ?? null,
      ibkr_cost_per_share: costPerShare !== null ? Math.round(costPerShare * 100) / 100 : null,
      ibkr_value: ib.positionValue,
      currency: ib.currency,
    });
  }
  // Positions DB détenues absentes chez IBKR (hors cash/manuelles)
  for (const p of positions) {
    if (seen.has(String(p.id))) continue;
    if (!p.yahoo_ticker || (p.quantity ?? 0) === 0) continue;
    rows.push({
      symbol: p.ticker,
      db_qty: p.quantity,
      ibkr_qty: null,
      qty_match: false,
      db_pru: p.pru,
      ibkr_cost_per_share: null,
      ibkr_value: null,
      currency: p.currency,
    });
  }

  return { at: stored.at, rows };
}
