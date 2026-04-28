"use client";

import { useEffect, useState } from "react";
import type { DividendSummary } from "@/lib/dividends-types";

/**
 * Widget compact "Dividendes" pour le dashboard global.
 *   - Total annuel attendu en EUR
 *   - Reçu YTD (depuis le journal d'opérations)
 *   - 3 prochains détachements dans les 30j
 *
 * Ne s'affiche que si total_expected_annual_eur > 0 (sinon : portfolio
 * 100% capitalisant ou sans actions à dividende).
 */

function eur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
  });
}

function dateShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export default function DividendsWidget() {
  const [data, setData] = useState<DividendSummary | null>(null);

  useEffect(() => {
    fetch("/api/dividends")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DividendSummary | null) => setData(d))
      .catch(() => {});
  }, []);

  if (!data || data.total_expected_annual_eur <= 0) return null;

  return (
    <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium text-gray-300">
          💰 Dividendes
        </h3>
        <div className="flex items-center gap-4 text-xs font-[family-name:var(--font-jetbrains)]">
          <span className="text-gray-500">
            Annuel attendu :{" "}
            <span className="text-emerald-400">
              {eur(data.total_expected_annual_eur)}
            </span>
          </span>
          {data.total_received_ytd_eur > 0 && (
            <span className="text-gray-500">
              Reçu YTD :{" "}
              <span className="text-sky-400">
                {eur(data.total_received_ytd_eur)}
              </span>
            </span>
          )}
        </div>
      </div>

      {data.upcoming_30d.length > 0 && (
        <div className="border-t border-gray-800 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">
            Prochains détachements (30j)
          </p>
          <ul className="space-y-1.5">
            {data.upcoming_30d.slice(0, 5).map((u) => (
              <li
                key={`${u.ticker}-${u.ex_date}`}
                className="flex items-center justify-between text-xs gap-3"
              >
                <span className="text-gray-300 font-[family-name:var(--font-jetbrains)] truncate">
                  <span className="text-gray-500">{dateShort(u.ex_date)}</span>{" "}
                  · {u.ticker}{" "}
                  <span className="text-gray-600 hidden sm:inline">
                    {u.label}
                  </span>
                </span>
                <span className="text-emerald-400 font-[family-name:var(--font-jetbrains)] flex-shrink-0">
                  ~{eur(u.estimated_amount_eur, 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
