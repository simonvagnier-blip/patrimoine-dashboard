"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import type { DividendSummary } from "@/lib/dividends-types";

interface Snapshot {
  date: string;
  total_value: number;
}

interface MiniSummary {
  averages: {
    avg_income_eur: number;
    avg_expense_eur: number;
    avg_savings_eur: number;
    avg_savings_rate_pct: number;
    months_with_data: number;
  };
}

function eur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
  });
}

/**
 * Barre compacte qui consolide plusieurs indicateurs dashboard auparavant
 * affichés dans des cartes empilées (SavingsWidget, DividendsWidget, banner
 * hebdo, sparkline standalone). Chaque pill s'efface si sa source n'a pas
 * de données — la barre entière disparaît si tous les pills sont vides.
 */
export default function StatsBar({
  history,
  grandTotal,
  basePath = "",
}: {
  history: Snapshot[];
  grandTotal: number;
  basePath?: string;
}) {
  const [dividends, setDividends] = useState<DividendSummary | null>(null);
  const [savings, setSavings] = useState<MiniSummary | null>(null);

  useEffect(() => {
    fetch("/api/dividends")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DividendSummary | null) => setDividends(d))
      .catch(() => {});
    fetch("/api/budget/summary?months=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MiniSummary | null) => setSavings(d))
      .catch(() => {});
  }, []);

  const hasDividends = !!dividends && dividends.total_expected_annual_eur > 0;
  const hasSavings = !!savings && savings.averages.months_with_data > 0;
  const savingsPositive = savings ? savings.averages.avg_savings_eur >= 0 : true;

  // Deltas sur 1j / 7j / 30j : on cherche le snapshot le plus récent
  // dont la date est ≤ maintenant - N jours (pour éviter de comparer à
  // un snapshot intra-journée qui fausserait le 1j).
  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  function deltaSince(days: number): { delta: number; pct: number | null } | null {
    const target = Date.now() - days * 86400000;
    let snapshot: Snapshot | null = null;
    for (const s of sortedHistory) {
      if (new Date(s.date).getTime() <= target) snapshot = s;
      else break;
    }
    if (!snapshot) return null;
    const delta = grandTotal - snapshot.total_value;
    const pct =
      snapshot.total_value > 0 ? (delta / snapshot.total_value) * 100 : null;
    return { delta, pct };
  }

  const deltas = [
    { label: "1j", data: deltaSince(1) },
    { label: "7j", data: deltaSince(7) },
    { label: "30j", data: deltaSince(30) },
  ];
  const hasDelta = deltas.some((d) => d.data !== null);

  const hasSparkline = history.length > 2;

  if (!hasDividends && !hasSavings && !hasDelta && !hasSparkline) return null;

  const budgetHref = `${basePath || "/perso"}/budget`;

  const pills: React.ReactNode[] = [];

  if (hasDividends) {
    pills.push(
      <div key="div" className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          💰 Div/an
        </span>
        <span className="text-sm font-semibold text-emerald-400 font-[family-name:var(--font-jetbrains)]">
          {eur(dividends!.total_expected_annual_eur)}
        </span>
        {dividends!.total_received_ytd_eur > 0 && (
          <span className="text-[11px] text-gray-500 font-[family-name:var(--font-jetbrains)]">
            (YTD {eur(dividends!.total_received_ytd_eur)})
          </span>
        )}
      </div>,
    );
  }

  if (hasSavings) {
    pills.push(
      <Link
        key="sav"
        href={budgetHref}
        className="flex items-baseline gap-2 hover:opacity-80 transition-opacity"
        title="Voir le budget"
      >
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          Épargne/mois
        </span>
        <span
          className={`text-sm font-semibold font-[family-name:var(--font-jetbrains)] ${
            savingsPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {savingsPositive ? "+" : ""}
          {eur(savings!.averages.avg_savings_eur)}
        </span>
        <span className="text-[11px] text-gray-500">
          {savings!.averages.avg_savings_rate_pct.toFixed(0)}%
        </span>
      </Link>,
    );
  }

  if (hasDelta) {
    pills.push(
      <div key="delta" className="flex items-baseline gap-3">
        {deltas.map(({ label, data }) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">
              {label}
            </span>
            {data ? (
              <>
                <span
                  className={`text-sm font-semibold font-[family-name:var(--font-jetbrains)] ${
                    data.delta >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {data.delta >= 0 ? "+" : ""}
                  {eur(data.delta)}
                </span>
                {data.pct !== null && (
                  <span className="text-[11px] text-gray-500 font-[family-name:var(--font-jetbrains)]">
                    ({data.pct >= 0 ? "+" : ""}
                    {data.pct.toFixed(1)}%)
                  </span>
                )}
              </>
            ) : (
              <span
                className="text-sm text-gray-600 font-[family-name:var(--font-jetbrains)]"
                title="Pas assez d'historique"
              >
                —
              </span>
            )}
          </div>
        ))}
      </div>,
    );
  }

  return (
    <div className="bg-[#0d1117] border border-gray-800 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
      {pills.map((pill, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="w-px h-5 bg-gray-800" />}
          {pill}
        </Fragment>
      ))}
      {hasSparkline && (
        <div className="ml-auto w-32 h-7 min-w-[100px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={history.map((s) => ({ date: s.date, value: s.total_value }))}
            >
              <Line
                type="monotone"
                dataKey="value"
                stroke="#34d399"
                strokeWidth={1.5}
                dot={false}
              />
              <RTooltip
                contentStyle={{
                  backgroundColor: "#161b22",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(v) => [eur(Number(v)), "Total"]}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
