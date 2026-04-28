"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Panneau d'analyse multi-mois : graphique stacked des revenus/dépenses des
 * 12 derniers mois + ligne d'épargne mensuelle, et 3 cards moyennes.
 *
 * Affiché en haut de la page Budget pour donner immédiatement une lecture
 * de la tendance et de la capacité d'épargne moyenne, qui sert d'input au
 * Lot 6 (what-if projections).
 */

interface MonthlyAggregate {
  month: string;
  income_eur: number;
  expense_eur: number;
  savings_eur: number;
  savings_rate_pct: number;
}

interface InvestmentReconciliation {
  category: string;
  envelope_id_guess: string | null;
  budget_total_eur: number;
  operations_total_eur: number;
  delta_eur: number;
  note: string;
}

interface Summary {
  monthly_aggregates: MonthlyAggregate[];
  averages: {
    avg_income_eur: number;
    avg_expense_eur: number;
    avg_savings_eur: number;
    avg_savings_rate_pct: number;
    months_with_data: number;
  };
  recurring_summary: {
    recurring_monthly_income_eur: number;
    recurring_monthly_expense_eur: number;
  };
  investment_reconciliation: InvestmentReconciliation[];
}

function eur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
  });
}

function ymShort(ym: string): string {
  const [y, m] = ym.split("-");
  return `${m}/${y.slice(2)}`;
}

export default function BudgetTrendPanel({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/budget/summary?months=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Summary | null) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return <div className="h-48 bg-gray-800/30 rounded-lg animate-pulse" />;
  }
  if (!data || data.averages.months_with_data === 0) {
    return (
      <div className="bg-[#0d1117] border border-gray-800 rounded-lg px-4 py-6 text-center text-sm text-gray-500">
        Aucune entrée enregistrée sur les 12 derniers mois.
        <br />
        Ajoute revenus et dépenses pour voir ta tendance et ta capacité d&apos;épargne.
      </div>
    );
  }

  const chartData = data.monthly_aggregates.map((a) => ({
    month: ymShort(a.month),
    income: a.income_eur,
    expense: a.expense_eur,
    savings: a.savings_eur,
  }));

  return (
    <div className="space-y-3">
      {/* 3 cards moyennes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-[#0d1117] border-gray-800">
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Revenus moyens / mois
            </p>
            <p className="text-2xl font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)] mt-1">
              {eur(data.averages.avg_income_eur)}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              dont {eur(data.recurring_summary.recurring_monthly_income_eur)} récurrents
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0d1117] border-gray-800">
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Dépenses moyennes / mois
            </p>
            <p className="text-2xl font-bold text-red-400 font-[family-name:var(--font-jetbrains)] mt-1">
              {eur(data.averages.avg_expense_eur)}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              dont {eur(data.recurring_summary.recurring_monthly_expense_eur)} récurrentes
            </p>
          </CardContent>
        </Card>
        <Card
          className={`border-gray-800 ${
            data.averages.avg_savings_eur >= 0
              ? "bg-emerald-900/10 border-emerald-700/40"
              : "bg-red-900/10 border-red-700/40"
          }`}
        >
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Capacité d&apos;épargne moyenne
            </p>
            <p
              className={`text-2xl font-bold font-[family-name:var(--font-jetbrains)] mt-1 ${
                data.averages.avg_savings_eur >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
            >
              {eur(data.averages.avg_savings_eur)}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              Taux : {data.averages.avg_savings_rate_pct.toFixed(0)}% · sur{" "}
              {data.averages.months_with_data} mois
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Graphique 12 mois */}
      <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-4">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
          Tendance 12 derniers mois
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
                }
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#161b22",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(value: unknown, name: unknown) => {
                  const label =
                    name === "income"
                      ? "Revenus"
                      : name === "expense"
                        ? "Dépenses"
                        : "Épargne";
                  return [eur(Number(value)), label];
                }}
              />
              <Bar dataKey="income" fill="#10b981" opacity={0.85} />
              <Bar dataKey="expense" fill="#ef4444" opacity={0.85} />
              <Line
                type="monotone"
                dataKey="savings"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f59e0b" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Réconciliation investissements */}
      {data.investment_reconciliation.length > 0 && (
        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 space-y-2">
          <p className="text-xs uppercase tracking-wider text-gray-500">
            Cohérence investissements (budget vs apports patrimoine)
          </p>
          {data.investment_reconciliation.map((r) => (
            <div
              key={r.category}
              className="flex items-center justify-between text-xs gap-3 py-1.5"
            >
              <span className="text-gray-300 font-medium">{r.category}</span>
              <div className="flex items-center gap-3 font-[family-name:var(--font-jetbrains)]">
                <span className="text-gray-500">
                  Budget : {eur(r.budget_total_eur)}
                </span>
                <span className="text-gray-500">
                  Réel : {eur(r.operations_total_eur)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded ${
                    Math.abs(r.delta_eur) < 1
                      ? "text-emerald-400 bg-emerald-900/20"
                      : "text-amber-400 bg-amber-900/20"
                  }`}
                  title={r.note}
                >
                  Δ {r.delta_eur >= 0 ? "+" : ""}
                  {eur(r.delta_eur)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
