"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import type { DividendSummary } from "@/lib/dividends-types";

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
  grandTotal,
  globalDeltas,
  basePath = "",
}: {
  grandTotal: number;
  /**
   * Performance marché PURE agrégée sur 1J/7J/30J. Calculé en amont dans
   * DashboardClient comme somme des perfs marché pures par enveloppe (en
   * excluant les contributions externes : achats, dépôts, retraits). Si null
   * pour une période, c'est qu'on n'a pas assez d'historique.
   */
  globalDeltas?: {
    d1: { perfEur: number; pct: number } | null;
    d7: { perfEur: number; pct: number } | null;
    d30: { perfEur: number; pct: number } | null;
  };
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

  // Deltas 1J/7J/30J : on lit directement les perfs marché pures pré-calculées
  // par DashboardClient (somme des perfs par enveloppe, contributions exclues).
  // C'est la même formule que les cards → cohérent partout.
  const deltas = globalDeltas
    ? [
        { label: "1j", data: globalDeltas.d1 },
        { label: "7j", data: globalDeltas.d7 },
        { label: "30j", data: globalDeltas.d30 },
      ]
    : [];
  const hasDelta = deltas.some((d) => d.data !== null);

  if (!hasDividends && !hasSavings && !hasDelta) return null;

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
      <div key="delta" className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
        {deltas.map(({ label, data }) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">
              {label}
            </span>
            {data ? (
              <>
                <span
                  className={`text-sm font-semibold font-[family-name:var(--font-jetbrains)] ${
                    data.perfEur >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {data.perfEur >= 0 ? "+" : ""}
                  {eur(data.perfEur)}
                </span>
                <span className="text-[11px] text-gray-500 font-[family-name:var(--font-jetbrains)]">
                  ({data.pct >= 0 ? "+" : ""}
                  {data.pct.toFixed(1)}%)
                </span>
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
    </div>
  );
}
