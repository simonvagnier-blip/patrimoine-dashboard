"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeCurrencyExposure,
  CURRENCY_LABELS,
  type ExposureInput,
} from "@/lib/currency-exposure";

interface Pos {
  currency: string;
  scenarioKey: string;
  value: number; // EUR
}

// Couleurs par devise (USD bleu = accent CTO, EUR vert, MGA ambre, reste variés)
const CUR_COLOR: Record<string, string> = {
  EUR: "#34d399", USD: "#38bdf8", MGA: "#d97706", JPY: "#f472b6", GBP: "#a78bfa",
  CHF: "#f59e0b", CAD: "#fb923c", CNY: "#ef4444", TWD: "#22d3ee", INR: "#a3e635",
  KRW: "#e879f9", BRL: "#facc15", Autres: "#6b7280",
};

function eur(v: number): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

/**
 * Exposition devise ÉCONOMIQUE (transparisation) — regarde à travers les ETF
 * vers les devises de leurs sous-jacents (un S&P 500 en PEA = risque USD).
 * Répond honnêtement à « combien de ma perf dépend du change ? ».
 */
export default function CurrencyExposurePanel({
  positions,
  hideAmounts = false,
}: {
  positions: Pos[];
  hideAmounts?: boolean;
}) {
  const input: ExposureInput[] = positions.map((p) => ({
    currency: p.currency,
    scenarioKey: p.scenarioKey,
    valueEur: p.value,
  }));
  const { byCurrency, total, foreignEur } = computeCurrencyExposure(input);
  if (total <= 0 || byCurrency.length < 2) return null;

  const m = (s: string) => (hideAmounts ? "•••" : s);
  const color = (c: string) => CUR_COLOR[c] ?? "#6b7280";
  const label = (c: string) => CURRENCY_LABELS[c] ?? c;

  return (
    <Card className="bg-[#11161f] border-gray-800">
      <CardHeader className="pb-2">
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Change</p>
        <CardTitle className="text-sm text-gray-200 font-medium">Exposition devise réelle (transparisée)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Barre empilée */}
        <div className="flex h-3 rounded-full overflow-hidden">
          {byCurrency.map((r) => (
            <div
              key={r.currency}
              style={{ width: `${r.pct}%`, backgroundColor: color(r.currency) }}
              title={`${label(r.currency)} : ${r.pct.toFixed(1)} %`}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          {byCurrency.map((r) => (
            <div key={r.currency} className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color(r.currency) }} />
              <span className="text-gray-300 flex-1">{label(r.currency)}</span>
              <span className="text-gray-400 font-[family-name:var(--font-jetbrains)] tabular-nums">{m(eur(r.valueEur))}</span>
              <span className="text-gray-500 font-[family-name:var(--font-jetbrains)] tabular-nums w-14 text-right">{r.pct.toFixed(1)} %</span>
            </div>
          ))}
        </div>
        {foreignEur > 0 && (
          <p className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-800 pt-2">
            {((foreignEur / total) * 100).toFixed(0)} % de ton patrimoine est exposé à une devise étrangère
            (sous-jacents des ETF inclus). Un mouvement de <span className="text-gray-400">±5 %</span> de ces
            devises vaut ≈ <span className="text-gray-300 font-[family-name:var(--font-jetbrains)]">{m(eur(foreignEur * 0.05))}</span>{" "}
            sur ta valeur en euros.
          </p>
        )}
        <p className="text-[10px] text-gray-600 leading-relaxed">
          Estimation par transparisation : les ETF cotés en euros (S&amp;P 500, Nasdaq, World, émergents) sont
          décomposés vers les devises de leurs sous-jacents selon les compositions indicielles standard.
        </p>
      </CardContent>
    </Card>
  );
}
