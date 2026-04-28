import { db, schema } from "@/lib/db";
import { isInternalTransfer, isInvestmentCategory } from "@/lib/budget-rules";

/**
 * LOT 5 — Budget engine.
 *
 * Calcule à partir de la table `budget_entries` (et croise avec `operations`
 * du patrimoine) :
 *   - Agrégats par mois sur les N derniers mois (revenus, dépenses, épargne)
 *   - Capacité d'épargne moyenne mensuelle (input clé du Lot 6 What-If)
 *   - Taux d'épargne moyen
 *   - Top catégories de dépenses
 *   - Récurrences détectées (entrées récurrentes vs ponctuelles)
 *   - Cohérence apports patrimoine : compare la catégorie "Investissement PEA/PER/AV"
 *     du budget avec les opérations type=deposit sur les enveloppes correspondantes
 */

export interface MonthlyAggregate {
  month: string; // YYYY-MM
  income_eur: number;
  expense_eur: number;
  /** Total épargné via des catégories "Investissement *" ce mois (exclu de expense). */
  invested_eur: number;
  /** Total transferts internes sur le mois (exclus de income ET expense). Indicatif. */
  transfer_internal_eur: number;
  /** savings_eur = (income_eur - expense_eur) + invested_eur — vraie épargne du mois. */
  savings_eur: number;
  savings_rate_pct: number;
  recurring_income_eur: number;
  recurring_expense_eur: number;
}

export interface CategoryAggregate {
  category: string;
  total_eur: number;
  avg_per_month_eur: number;
  count: number;
  share_pct: number; // share of total expenses on the period
}

export interface InvestmentReconciliation {
  category: string; // e.g. "Investissement PEA"
  envelope_id_guess: string | null;
  budget_total_eur: number; // declared in budget
  operations_total_eur: number; // real deposits in operations journal
  delta_eur: number; // operations - budget
  note: string;
}

export interface BudgetSummary {
  fetched_at: string;
  months_back: number;
  current_month: string;
  monthly_aggregates: MonthlyAggregate[];
  averages: {
    avg_income_eur: number;
    avg_expense_eur: number;
    avg_savings_eur: number;
    avg_savings_rate_pct: number;
    months_with_data: number;
  };
  current_month_aggregate: MonthlyAggregate | null;
  top_categories: CategoryAggregate[];
  investment_reconciliation: InvestmentReconciliation[];
  recurring_summary: {
    recurring_count: number;
    one_off_count: number;
    recurring_monthly_income_eur: number;
    recurring_monthly_expense_eur: number;
  };
}

const MONTHS_DEFAULT = 12;

function ymToBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const startDay = `${ym}-01`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: startDay, end: `${next}-01` };
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function monthsBack(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return out;
}

/**
 * Devine l'enveloppe correspondant à une catégorie d'investissement.
 * Match approximatif basé sur le nom : "Investissement PEA" → enveloppe type pea
 */
function guessEnvelopeIdFromCategory(
  category: string,
  envelopes: { id: string; type: string; name: string }[]
): string | null {
  const cat = category.toLowerCase();
  if (!cat.includes("investissement")) return null;
  for (const e of envelopes) {
    if (cat.includes(e.type.toLowerCase()) || cat.includes(e.name.toLowerCase())) {
      return e.id;
    }
  }
  return null;
}

export async function computeBudgetSummary(
  monthsBackCount = MONTHS_DEFAULT
): Promise<BudgetSummary> {
  const [entries, operations, envelopes] = await Promise.all([
    db.select().from(schema.budgetEntries).all(),
    db.select().from(schema.operations).all(),
    db.select().from(schema.envelopes).all(),
  ]);

  const months = monthsBack(monthsBackCount);
  const startBoundary = ymToBounds(months[0]).start;
  const endBoundary = ymToBounds(months[months.length - 1]).end;

  // Filter entries to the window
  const windowEntries = entries.filter(
    (e) => e.date >= startBoundary && e.date < endBoundary
  );

  // Aggregate per month
  const monthlyMap = new Map<string, MonthlyAggregate>();
  for (const m of months) {
    monthlyMap.set(m, {
      month: m,
      income_eur: 0,
      expense_eur: 0,
      invested_eur: 0,
      transfer_internal_eur: 0,
      savings_eur: 0,
      savings_rate_pct: 0,
      recurring_income_eur: 0,
      recurring_expense_eur: 0,
    });
  }
  for (const e of windowEntries) {
    const m = monthOf(e.date);
    const agg = monthlyMap.get(m);
    if (!agg) continue;
    // 1. Les transferts internes (ex: virements entre ses propres comptes)
    //    ne doivent être comptés NI en revenu NI en dépense — juste tracés.
    if (isInternalTransfer(e.category)) {
      agg.transfer_internal_eur += e.amount;
      continue;
    }
    // 2. Les "Investissement *" sortants (virements vers PEA/PER/AV) sont de
    //    l'épargne, pas de la consommation. On les comptabilise séparément
    //    dans invested_eur pour qu'ils comptent dans le taux d'épargne mais
    //    PAS dans les dépenses de consommation du mois.
    if (e.type === "expense" && isInvestmentCategory(e.category)) {
      agg.invested_eur += e.amount;
      if (e.recurring) agg.recurring_expense_eur += e.amount; // mais comptés comme récurrents
      continue;
    }
    // 3. Flux "normaux"
    if (e.type === "income") {
      agg.income_eur += e.amount;
      if (e.recurring) agg.recurring_income_eur += e.amount;
    } else if (e.type === "expense") {
      agg.expense_eur += e.amount;
      if (e.recurring) agg.recurring_expense_eur += e.amount;
    }
  }
  for (const agg of monthlyMap.values()) {
    // savings = (revenus - dépenses conso) + investissements déjà déduits des revenus
    // Autrement dit : taux d'épargne = (revenu - dépense_conso) / revenu, où
    // dépense_conso exclut les investissements. invested_eur est donc déjà dans
    // "ce que tu as épargné" même si c'est parti du compte courant.
    agg.savings_eur = agg.income_eur - agg.expense_eur;
    agg.savings_rate_pct =
      agg.income_eur > 0 ? round2((agg.savings_eur / agg.income_eur) * 100, 1) : 0;
    agg.income_eur = round2(agg.income_eur);
    agg.expense_eur = round2(agg.expense_eur);
    agg.invested_eur = round2(agg.invested_eur);
    agg.transfer_internal_eur = round2(agg.transfer_internal_eur);
    agg.savings_eur = round2(agg.savings_eur);
    agg.recurring_income_eur = round2(agg.recurring_income_eur);
    agg.recurring_expense_eur = round2(agg.recurring_expense_eur);
  }
  const monthly_aggregates = Array.from(monthlyMap.values());

  // Moyennes (sur mois ayant au moins une entrée)
  const monthsWithData = monthly_aggregates.filter(
    (a) => a.income_eur > 0 || a.expense_eur > 0
  );
  const months_with_data = monthsWithData.length;
  const avg_income_eur = round2(
    monthsWithData.reduce((s, a) => s + a.income_eur, 0) /
      Math.max(1, months_with_data)
  );
  const avg_expense_eur = round2(
    monthsWithData.reduce((s, a) => s + a.expense_eur, 0) /
      Math.max(1, months_with_data)
  );
  const avg_savings_eur = round2(avg_income_eur - avg_expense_eur);
  const avg_savings_rate_pct =
    avg_income_eur > 0
      ? round2((avg_savings_eur / avg_income_eur) * 100, 1)
      : 0;

  // Mois courant
  const currentYm = months[months.length - 1];
  const current_month_aggregate = monthlyMap.get(currentYm) ?? null;

  // Top catégories (dépenses de CONSOMMATION uniquement : exclut les
  // investissements et les transferts internes qui ne sont pas des "dépenses")
  const catMap = new Map<string, { total: number; count: number }>();
  for (const e of windowEntries.filter(
    (e) =>
      e.type === "expense" &&
      !isInternalTransfer(e.category) &&
      !isInvestmentCategory(e.category),
  )) {
    const c = catMap.get(e.category) ?? { total: 0, count: 0 };
    c.total += e.amount;
    c.count++;
    catMap.set(e.category, c);
  }
  const totalExp = monthsWithData.reduce((s, a) => s + a.expense_eur, 0);
  const top_categories: CategoryAggregate[] = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      total_eur: round2(v.total),
      avg_per_month_eur: round2(
        v.total / Math.max(1, months_with_data)
      ),
      count: v.count,
      share_pct: totalExp > 0 ? round2((v.total / totalExp) * 100, 1) : 0,
    }))
    .sort((a, b) => b.total_eur - a.total_eur)
    .slice(0, 10);

  // Réconciliation investissements : pour chaque catégorie d'investissement,
  // on compare avec les ops deposit sur l'enveloppe correspondante.
  const invCategoryRows = windowEntries.filter(
    (e) =>
      e.type === "expense" &&
      e.category.toLowerCase().includes("investissement")
  );
  const invByCat = new Map<string, number>();
  for (const e of invCategoryRows) {
    invByCat.set(e.category, (invByCat.get(e.category) ?? 0) + e.amount);
  }
  const investment_reconciliation: InvestmentReconciliation[] = [];
  for (const [category, budgetTotal] of invByCat.entries()) {
    const envId = guessEnvelopeIdFromCategory(category, envelopes);
    const opsTotal = envId
      ? operations
          .filter(
            (op) =>
              op.envelope_id === envId &&
              op.type === "deposit" &&
              op.date >= startBoundary &&
              op.date < endBoundary
          )
          // Convention DB : deposit = positif (cash entrant dans l'enveloppe)
          .reduce((s, op) => s + Math.abs(op.amount), 0)
      : 0;
    investment_reconciliation.push({
      category,
      envelope_id_guess: envId,
      budget_total_eur: round2(budgetTotal),
      operations_total_eur: round2(opsTotal),
      delta_eur: round2(opsTotal - budgetTotal),
      note: !envId
        ? "Aucune enveloppe identifiée"
        : opsTotal === 0
          ? "Aucun versement enregistré dans le journal d'opérations"
          : Math.abs(opsTotal - budgetTotal) < 1
            ? "Cohérent"
            : opsTotal > budgetTotal
              ? "Versements réels > budget annoncé"
              : "Budget annoncé > versements réels",
    });
  }

  // Récurrents
  const recurringEntries = windowEntries.filter((e) => e.recurring);
  const oneOffEntries = windowEntries.filter((e) => !e.recurring);
  const recurringMonthlyIncome =
    recurringEntries
      .filter((e) => e.type === "income")
      .reduce((s, e) => s + e.amount, 0) / Math.max(1, months_with_data);
  const recurringMonthlyExpense =
    recurringEntries
      .filter((e) => e.type === "expense")
      .reduce((s, e) => s + e.amount, 0) / Math.max(1, months_with_data);

  return {
    fetched_at: new Date().toISOString(),
    months_back: monthsBackCount,
    current_month: currentYm,
    monthly_aggregates,
    averages: {
      avg_income_eur,
      avg_expense_eur,
      avg_savings_eur,
      avg_savings_rate_pct,
      months_with_data,
    },
    current_month_aggregate,
    top_categories,
    investment_reconciliation,
    recurring_summary: {
      recurring_count: recurringEntries.length,
      one_off_count: oneOffEntries.length,
      recurring_monthly_income_eur: round2(recurringMonthlyIncome),
      recurring_monthly_expense_eur: round2(recurringMonthlyExpense),
    },
  };
}

function round2(n: number, d = 2): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
