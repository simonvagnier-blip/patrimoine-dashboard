"use client";

import { useEffect, useState } from "react";
import type { DividendInfo } from "@/lib/dividends-types";

/**
 * Mini-section "Dividendes" affichée dans le panneau étendu d'une position.
 * S'affiche uniquement si Yahoo retourne un yield > 0 (sinon : rien à montrer
 * pour les ETF capitalisants ou les actions sans dividende).
 */

function formatEur(v: number, d = 2): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
  });
}

function formatLocal(v: number, currency: string, d = 2): string {
  if (currency === "USD") {
    return v.toLocaleString("fr-FR", { maximumFractionDigits: d }) + " $";
  }
  return formatEur(v, d);
}

function formatDate(ymd: string | null): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const FREQ_LABEL: Record<number, string> = {
  1: "annuel",
  2: "semestriel",
  4: "trimestriel",
  12: "mensuel",
};

export default function PositionDividends({
  ticker,
  yahooTicker,
  quantity,
  eurUsd,
}: {
  ticker: string;
  yahooTicker: string | null;
  quantity: number | null;
  eurUsd: number;
}) {
  const [info, setInfo] = useState<DividendInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!yahooTicker) {
      setLoading(false);
      return;
    }
    fetch(`/api/dividends?ticker=${encodeURIComponent(yahooTicker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DividendInfo | null) => {
        setInfo(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [yahooTicker]);

  // Pas d'affichage si pas de dividende
  if (loading) return null;
  if (!info || !info.yield_pct || info.yield_pct === 0) return null;

  const qty = quantity ?? 0;
  const annualLocal = info.annual_rate ? info.annual_rate * qty : 0;
  const annualEur =
    info.annual_rate
      ? info.currency === "USD"
        ? annualLocal / eurUsd
        : annualLocal
      : 0;

  return (
    <div className="space-y-2 mt-2">
      <h4 className="text-xs uppercase text-gray-500 font-medium">Dividendes</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">Yield</p>
          <p className="text-sm text-emerald-400 font-[family-name:var(--font-jetbrains)]">
            {(info.yield_pct * 100).toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">Annuel attendu</p>
          <p className="text-sm text-white font-[family-name:var(--font-jetbrains)]">
            {formatEur(annualEur, 0)}
          </p>
          <p className="text-[10px] text-gray-600">
            {info.annual_rate
              ? `${formatLocal(info.annual_rate, info.currency)}/part`
              : "—"}
            {info.frequency_per_year &&
              ` · ${FREQ_LABEL[info.frequency_per_year] ?? info.frequency_per_year + "x/an"}`}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">Prochaine ex-date</p>
          <p className="text-sm text-white font-[family-name:var(--font-jetbrains)]">
            {formatDate(info.next_ex_date)}
          </p>
          {info.next_amount_estimate && (
            <p className="text-[10px] text-gray-600">
              ~{formatLocal(info.next_amount_estimate * qty, info.currency, 2)}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">Reçu 12m</p>
          <p className="text-sm text-gray-300 font-[family-name:var(--font-jetbrains)]">
            {info.past_12m_total
              ? formatLocal(info.past_12m_total * qty, info.currency, 0)
              : "—"}
          </p>
          {info.payment_count_12m > 0 && (
            <p className="text-[10px] text-gray-600">
              {info.payment_count_12m} versement{info.payment_count_12m > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
