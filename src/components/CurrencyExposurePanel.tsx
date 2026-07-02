"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Pos {
  currency: string;
  value: number; // EUR
}

const CUR_META: Record<string, { label: string; color: string }> = {
  EUR: { label: "Euro", color: "#34d399" },
  USD: { label: "Dollar US", color: "#38bdf8" },
  MGA: { label: "Ariary (MGA)", color: "#d97706" },
};

function eur(v: number): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

/**
 * Exposition par devise (C7) — quelle part du patrimoine est libellée en EUR,
 * USD, MGA ? Répond à « combien de ma perf dépend du change ? » pour un
 * portefeuille EUR avec un gros bloc USD. Sensibilité = impact d'un mouvement
 * de ±5 % de la devise étrangère sur la valeur en EUR (calcul exact, pas
 * d'historique requis).
 */
export default function CurrencyExposurePanel({
  positions,
  hideAmounts = false,
}: {
  positions: Pos[];
  hideAmounts?: boolean;
}) {
  const byCur = new Map<string, number>();
  for (const p of positions) {
    if (p.value <= 0) continue;
    byCur.set(p.currency, (byCur.get(p.currency) ?? 0) + p.value);
  }
  const total = [...byCur.values()].reduce((s, v) => s + v, 0);
  if (total <= 0 || byCur.size < 2) return null; // rien à montrer si mono-devise

  const rows = [...byCur.entries()]
    .map(([cur, value]) => ({
      cur,
      value,
      pct: (value / total) * 100,
      meta: CUR_META[cur] ?? { label: cur, color: "#6b7280" },
    }))
    .sort((a, b) => b.value - a.value);

  const foreign = rows.filter((r) => r.cur !== "EUR").reduce((s, r) => s + r.value, 0);
  const m = (s: string) => (hideAmounts ? "•••" : s);

  return (
    <Card className="bg-[#11161f] border-gray-800">
      <CardHeader className="pb-2">
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Change</p>
        <CardTitle className="text-sm text-gray-200 font-medium">Exposition par devise</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Barre empilée */}
        <div className="flex h-3 rounded-full overflow-hidden">
          {rows.map((r) => (
            <div
              key={r.cur}
              style={{ width: `${r.pct}%`, backgroundColor: r.meta.color }}
              title={`${r.meta.label} : ${r.pct.toFixed(1)} %`}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.cur} className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.meta.color }} />
              <span className="text-gray-300 flex-1">{r.meta.label}</span>
              <span className="text-gray-400 font-[family-name:var(--font-jetbrains)] tabular-nums">{m(eur(r.value))}</span>
              <span className="text-gray-500 font-[family-name:var(--font-jetbrains)] tabular-nums w-14 text-right">{r.pct.toFixed(1)} %</span>
            </div>
          ))}
        </div>
        {foreign > 0 && (
          <p className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-800 pt-2">
            {((foreign / total) * 100).toFixed(0)} % de ton patrimoine est en devise étrangère.
            Un mouvement de <span className="text-gray-400">±5 %</span> de ces devises vaut{" "}
            <span className="text-gray-300 font-[family-name:var(--font-jetbrains)]">{m(eur(foreign * 0.05))}</span>{" "}
            sur ta valeur en euros — indépendamment de la performance des actifs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
