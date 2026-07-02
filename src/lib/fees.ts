import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Frais cumulés par enveloppe (C7). Deux sources, toutes deux converties en EUR :
 *   1. Opérations `fee` explicites (frais de gestion AV/PER, courtage saisi à part)
 *   2. Commissions INCLUSES dans les achats/ventes (PRU frais inclus, convention) :
 *        - buy  : commission = |amount| − |quantity × unit_price|   (amount gonflé)
 *        - sell : commission = |quantity × unit_price| − |amount|   (produit net)
 *
 * Le total « ronge la performance » : rendre visible ce coût par enveloppe et
 * par an est directement actionnable (arbitrage AV chères, choix du courtier).
 */

export interface FeeBreakdown {
  envelope_id: string;
  envelope_name: string;
  explicit_fees_eur: number; // ops type=fee
  commissions_eur: number; // incluses dans buy/sell
  total_eur: number;
  by_year: Record<string, number>; // "2026" -> total EUR de l'année
}

export interface FeesResult {
  fetched_at: string;
  eur_usd: number;
  mga_eur_rate: number;
  total_eur: number;
  by_year: Record<string, number>;
  envelopes: FeeBreakdown[];
}

async function readFxRates(): Promise<{ eurUsd: number; mgaEurRate: number }> {
  try {
    const row = await db
      .select()
      .from(schema.userParams)
      .where(eq(schema.userParams.key, "lastKnownQuotes"))
      .get();
    if (row) {
      const p = JSON.parse(row.value) as { eurUsd?: number; mgaEurRate?: number };
      return {
        eurUsd: p.eurUsd && p.eurUsd > 0 ? p.eurUsd : 1.08,
        mgaEurRate: p.mgaEurRate && p.mgaEurRate > 0 ? p.mgaEurRate : 4800,
      };
    }
  } catch {}
  return { eurUsd: 1.08, mgaEurRate: 4800 };
}

export async function computeFees(): Promise<FeesResult> {
  const { eurUsd, mgaEurRate } = await readFxRates();
  const toEur = (amount: number, currency: string) =>
    currency === "USD" ? amount / eurUsd : currency === "MGA" ? amount / mgaEurRate : amount;

  const envelopes = await db.select().from(schema.envelopes).all();
  const ops = await db.select().from(schema.operations).all();
  const nameById = new Map(envelopes.map((e) => [e.id, e.name]));

  const acc = new Map<string, FeeBreakdown>();
  const ensure = (id: string): FeeBreakdown => {
    let b = acc.get(id);
    if (!b) {
      b = {
        envelope_id: id,
        envelope_name: nameById.get(id) ?? id,
        explicit_fees_eur: 0,
        commissions_eur: 0,
        total_eur: 0,
        by_year: {},
      };
      acc.set(id, b);
    }
    return b;
  };

  const byYearGlobal: Record<string, number> = {};

  for (const op of ops) {
    const year = (op.date || "").slice(0, 4);
    let feeEur = 0;

    if (op.type === "fee") {
      feeEur = Math.abs(toEur(op.amount, op.currency));
      const b = ensure(op.envelope_id);
      b.explicit_fees_eur += feeEur;
    } else if (
      (op.type === "buy" || op.type === "sell") &&
      typeof op.quantity === "number" &&
      typeof op.unit_price === "number"
    ) {
      const gross = Math.abs(op.quantity * op.unit_price);
      const net = Math.abs(op.amount);
      // buy : amount = gross + commission → commission = net − gross
      // sell: amount = gross − commission → commission = gross − net
      const commissionLocal = op.type === "buy" ? net - gross : gross - net;
      if (commissionLocal > 0.005) {
        feeEur = toEur(commissionLocal, op.currency);
        const b = ensure(op.envelope_id);
        b.commissions_eur += feeEur;
      }
    }

    if (feeEur > 0) {
      const b = ensure(op.envelope_id);
      b.by_year[year] = (b.by_year[year] ?? 0) + feeEur;
      byYearGlobal[year] = (byYearGlobal[year] ?? 0) + feeEur;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const list = [...acc.values()].map((b) => ({
    ...b,
    explicit_fees_eur: round(b.explicit_fees_eur),
    commissions_eur: round(b.commissions_eur),
    total_eur: round(b.explicit_fees_eur + b.commissions_eur),
    by_year: Object.fromEntries(Object.entries(b.by_year).map(([y, v]) => [y, round(v)])),
  }));
  list.sort((a, b) => b.total_eur - a.total_eur);

  return {
    fetched_at: new Date().toISOString(),
    eur_usd: eurUsd,
    mga_eur_rate: mgaEurRate,
    total_eur: round(list.reduce((s, b) => s + b.total_eur, 0)),
    by_year: Object.fromEntries(Object.entries(byYearGlobal).map(([y, v]) => [y, round(v)])),
    envelopes: list,
  };
}
