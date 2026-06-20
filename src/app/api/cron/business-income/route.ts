import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Cron mensuel — encaissement des intérêts des deals Business Madagascar.
 *
 * Tourne le 21 de chaque mois (cf vercel.json). Pour chaque "rule" ci-dessous :
 *   1. Vérifie qu'aucune opération `interest` n'existe déjà pour ce
 *      position_id à cette date (idempotence)
 *   2. Insère une op `interest` dans le journal d'opérations (traçabilité)
 *   3. Incrémente la `manual_value` de la position cible "Cash MGA" pour
 *      refléter le cash reçu
 *
 * Idempotent : si on relance le même jour, rien ne se passe.
 *
 * Auth : Bearer CRON_SECRET, comme les autres crons.
 */

interface BusinessIncomeRule {
  source_ticker: string; // ticker de la position génératrice (ex: "TEX-LOAN")
  target_ticker: string; // ticker de la position qui reçoit le cash (ex: "CASH-MGA")
  envelope_id: string;
  /** Montant net en MGA reversé chaque mois pour MA part (Simon). */
  monthly_mga: number;
  note: string;
}

const RULES: BusinessIncomeRule[] = [
  {
    source_ticker: "TEX-LOAN",
    target_ticker: "CASH-MGA",
    envelope_id: "madagascar",
    // 10% × 69.3M MGA × 50% de part = 3,465,000 MGA / mois pour Simon
    monthly_mga: 3_465_000,
    note: "Intérêts mensuels prêt textile (10% × 50% de part)",
  },
];

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const nowIso = new Date().toISOString();
  const log: Array<{ rule: string; status: string; detail?: string }> = [];

  for (const rule of RULES) {
    // 1. Trouve la position source (le prêt)
    const sourcePos = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.envelope_id, rule.envelope_id),
          eq(schema.positions.ticker, rule.source_ticker),
        ),
      )
      .get();
    if (!sourcePos) {
      log.push({ rule: rule.source_ticker, status: "skipped", detail: "source position introuvable" });
      continue;
    }

    // 2. Idempotence : vérifie qu'on n'a pas déjà payé ce mois-ci
    const ym = today.slice(0, 7); // YYYY-MM
    const monthStart = `${ym}-01`;
    const [y, m] = ym.split("-").map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const existing = await db
      .select()
      .from(schema.operations)
      .where(
        and(
          eq(schema.operations.envelope_id, rule.envelope_id),
          eq(schema.operations.position_id, sourcePos.id),
          eq(schema.operations.type, "interest"),
        ),
      )
      .all();
    const alreadyPaid = existing.some((op) => op.date >= monthStart && op.date < nextMonth);
    if (alreadyPaid) {
      log.push({ rule: rule.source_ticker, status: "skipped", detail: `déjà payé pour ${ym}` });
      continue;
    }

    // 3. Trouve la position cible (le cash)
    const cashPos = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.envelope_id, rule.envelope_id),
          eq(schema.positions.ticker, rule.target_ticker),
        ),
      )
      .get();
    if (!cashPos) {
      log.push({ rule: rule.source_ticker, status: "error", detail: "cash position introuvable" });
      continue;
    }

    // 4. Insère l'opération interest (amount négatif = entrée d'argent côté
    //    investisseur, convention du schema cf src/lib/schema.ts).
    await db
      .insert(schema.operations)
      .values({
        envelope_id: rule.envelope_id,
        position_id: sourcePos.id,
        date: today,
        type: "interest",
        amount: -rule.monthly_mga,
        currency: "MGA",
        note: rule.note,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .run();

    // 5. Augmente la cagnotte Cash MGA
    const newValue = (cashPos.manual_value ?? 0) + rule.monthly_mga;
    await db
      .update(schema.positions)
      .set({ manual_value: newValue, updated_at: nowIso })
      .where(eq(schema.positions.id, cashPos.id))
      .run();

    log.push({
      rule: rule.source_ticker,
      status: "added",
      detail: `+${rule.monthly_mga.toLocaleString("fr-FR")} MGA sur ${cashPos.ticker} → ${newValue.toLocaleString("fr-FR")} MGA`,
    });
  }

  return NextResponse.json({ ok: true, date: today, log });
}
