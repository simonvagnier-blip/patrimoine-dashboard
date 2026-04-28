"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Widget compact "Capacité d'épargne" affiché sur le dashboard patrimoine.
 * Montre le taux moyen + montant moyen sur 12 mois et invite à voir le détail.
 *
 * S'efface si aucune donnée budget n'est disponible (n'encombre pas la page
 * de l'utilisateur qui ne tient pas de budget).
 */

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

export default function SavingsWidget({ basePath = "" }: { basePath?: string }) {
  const [data, setData] = useState<MiniSummary | null>(null);

  useEffect(() => {
    fetch("/api/budget/summary?months=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MiniSummary | null) => setData(d))
      .catch(() => {});
  }, []);

  if (!data || data.averages.months_with_data === 0) return null;

  const { avg_savings_eur, avg_savings_rate_pct, months_with_data } =
    data.averages;
  const positive = avg_savings_eur >= 0;
  // basePath = "" sur /perso, sinon /perso pour le lien depuis "Tout"
  const budgetHref = `${basePath || "/perso"}/budget`;

  return (
    <Link
      href={budgetHref}
      className={`block bg-[#0d1117] border rounded-lg px-4 py-3 transition-colors ${
        positive
          ? "border-emerald-700/40 hover:border-emerald-600"
          : "border-red-700/40 hover:border-red-600"
      }`}
    >
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Capacité d&apos;épargne mensuelle
          </p>
          <p
            className={`text-lg font-bold font-[family-name:var(--font-jetbrains)] mt-0.5 ${
              positive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {positive ? "+" : ""}
            {eur(avg_savings_eur)}
            <span className="text-xs text-gray-500 ml-2">
              taux {avg_savings_rate_pct.toFixed(0)}%
            </span>
          </p>
        </div>
        <p className="text-[11px] text-gray-500">
          Moyenne sur {months_with_data} mois · voir le budget →
        </p>
      </div>
    </Link>
  );
}
