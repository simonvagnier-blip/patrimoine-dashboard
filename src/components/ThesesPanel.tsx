"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ThesisPosition {
  id: number;
  ticker: string;
  quantity: number | null;
  tags?: string | null; // JSON array sérialisé
  value: number; // EUR
  pnl: number | null; // EUR
}

function parseTags(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function eur(v: number): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

/**
 * Performance par THÈSE d'investissement (C6) — groupe les positions par tag
 * (photonique, consumption layer…), agrège valeur + P&L latent. Une position
 * peut porter plusieurs tags (comptée dans chacun, à poids plein).
 */
export default function ThesesPanel({
  positions,
  hideAmounts = false,
}: {
  positions: ThesisPosition[];
  hideAmounts?: boolean;
}) {
  const groups = new Map<string, { value: number; cost: number; hasPnl: boolean; tickers: string[]; soldTickers: string[] }>();
  let untagged = 0;

  for (const p of positions) {
    const tags = parseTags(p.tags);
    const sold = p.quantity === 0;
    if (tags.length === 0) {
      if (!sold && p.value > 0) untagged++;
      continue;
    }
    for (const tag of tags) {
      const g = groups.get(tag) ?? { value: 0, cost: 0, hasPnl: false, tickers: [], soldTickers: [] };
      if (sold) {
        g.soldTickers.push(p.ticker);
      } else {
        g.value += p.value;
        if (p.pnl !== null) {
          g.cost += p.value - p.pnl;
          g.hasPnl = true;
        }
        g.tickers.push(p.ticker);
      }
      groups.set(tag, g);
    }
  }

  if (groups.size === 0) return null;

  const rows = [...groups.entries()]
    .map(([tag, g]) => ({
      tag,
      ...g,
      pnl: g.hasPnl ? g.value - g.cost : null,
      pnlPct: g.hasPnl && g.cost > 0 ? ((g.value - g.cost) / g.cost) * 100 : null,
    }))
    .sort((a, b) => b.value - a.value);
  const maxValue = Math.max(...rows.map((r) => r.value), 1);

  return (
    <Card className="bg-[#0d1117] border-gray-800">
      <CardHeader className="pb-2">
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Performance</p>
        <CardTitle className="text-sm text-gray-200 font-medium">Par thèse</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => (
          <div key={r.tag}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-gray-200 capitalize">{r.tag}</span>
              <span className="font-[family-name:var(--font-jetbrains)] tabular-nums text-sm">
                {r.pnlPct !== null && (
                  <span className={`font-bold ${r.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)} %
                  </span>
                )}
                {r.pnl !== null && (
                  <span className={`text-xs ml-2 ${r.pnl >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                    {hideAmounts ? "••••" : `${r.pnl >= 0 ? "+" : ""}${eur(r.pnl)}`}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1.5 h-2 bg-[#161b22] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${(r.pnlPct ?? 0) >= 0 ? "bg-emerald-500/70" : "bg-red-500/70"}`}
                style={{ width: `${Math.max(3, (r.value / maxValue) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1 font-[family-name:var(--font-jetbrains)]">
              {r.tickers.join(" · ")}
              {r.soldTickers.length > 0 && (
                <span className="text-gray-600"> (+ soldées : {r.soldTickers.join(", ")})</span>
              )}
              <span className="ml-2 text-gray-400">{hideAmounts ? "••••" : eur(r.value)}</span>
            </p>
          </div>
        ))}
        {untagged > 0 && (
          <p className="text-[11px] text-gray-500">
            {untagged} position{untagged > 1 ? "s" : ""} sans thèse — édite une position pour lui en attribuer une.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
