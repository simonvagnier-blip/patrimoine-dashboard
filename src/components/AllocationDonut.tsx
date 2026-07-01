"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const SCENARIO_LABELS: Record<string, string> = {
  sp: "S&P 500", wd: "MSCI World", em: "Emerging Markets", nq: "Nasdaq-100",
  tech: "Tech/Growth", energy: "Énergie", crypto: "Crypto",
  fg: "Fonds garanti", fe: "Fonds euros", cash: "Cash",
  business: "Business (privé)",
  cash_mga: "Cash Mada (MGA)",
};

const SCENARIO_COLORS: Record<string, string> = {
  sp: "#3b82f6", wd: "#34d399", em: "#f59e0b", nq: "#a78bfa",
  // energy en rose (avant #ef4444 = rouge, collision avec le rouge de perte)
  tech: "#38bdf8", energy: "#ec4899", crypto: "#f7931a",
  fg: "#6b7280", fe: "#9ca3af", cash: "#4b5563",
  business: "#d97706",
  cash_mga: "#0891b2",
};

interface AllocationData {
  name: string;
  value: number;
  key: string;
  pct: number;
}

interface AllocationDonutProps {
  data: AllocationData[];
  hideAmounts?: boolean;
}

function CustomTooltip({ active, payload, hideAmounts }: { active?: boolean; payload?: Array<{ payload: AllocationData }>; hideAmounts?: boolean }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-sm">
      <p className="text-white font-medium">{d.name}</p>
      <p className="text-gray-300 font-[family-name:var(--font-jetbrains)]">
        {hideAmounts ? "•••• €" : d.value.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
      </p>
      <p className="text-gray-400">{d.pct.toFixed(1)}%</p>
    </div>
  );
}

export default function AllocationDonut({ data, hideAmounts = false }: AllocationDonutProps) {
  // R7: Interactive legend with highlight
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const total = data.reduce((s, d) => s + d.value, 0);
  const active = activeKey ? data.find((d) => d.key === activeKey) : null;
  const fmtEur = (v: number) =>
    hideAmounts ? "•••• €" : v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  // Layout VERTICAL : le composant vit dans une carte étroite (1/3 de colonne
  // sur desktop depuis C2) — un layout côte-à-côte basé sur la largeur de
  // l'ÉCRAN y superposait la légende. Donut centré + total au centre (ou
  // détail de la classe survolée) + légende pleine largeur en 1 colonne.
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-[240px] h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={108}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={SCENARIO_COLORS[entry.key] || "#6b7280"}
                  opacity={activeKey === null || activeKey === entry.key ? 1 : 0.25}
                  style={{ transition: "opacity 0.2s", cursor: "pointer" }}
                  onMouseEnter={() => setActiveKey(entry.key)}
                  onMouseLeave={() => setActiveKey(null)}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip hideAmounts={hideAmounts} />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre du donut : total, ou détail de la classe survolée */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-10">
          {active ? (
            <>
              <span className="text-[11px] text-gray-400 truncate max-w-full">{active.name}</span>
              <span className="text-lg font-bold text-white font-[family-name:var(--font-jetbrains)] tabular-nums">
                {active.pct.toFixed(1)}%
              </span>
              <span className="text-[11px] text-gray-400 font-[family-name:var(--font-jetbrains)] tabular-nums">
                {fmtEur(active.value)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Total</span>
              <span className="text-lg font-bold text-white font-[family-name:var(--font-jetbrains)] tabular-nums">
                {fmtEur(total)}
              </span>
              <span className="text-[11px] text-gray-500">{data.length} classes</span>
            </>
          )}
        </div>
      </div>
      <div className="w-full space-y-1">
        {data.map((d) => (
          <div
            key={d.key}
            className={`text-sm px-2 py-1.5 rounded-md cursor-pointer transition-all ${
              activeKey === d.key ? "bg-[#161b22]" : "hover:bg-[#161b22]/50"
            }`}
            onMouseEnter={() => setActiveKey(d.key)}
            onMouseLeave={() => setActiveKey(null)}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: SCENARIO_COLORS[d.key] || "#6b7280" }}
              />
              <span className="text-gray-300 truncate flex-1">{d.name}</span>
              <span className="text-gray-400 font-[family-name:var(--font-jetbrains)] tabular-nums text-xs whitespace-nowrap">
                {hideAmounts ? "•••• €" : d.value.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
              </span>
              <span className="text-gray-500 font-[family-name:var(--font-jetbrains)] tabular-nums text-xs w-12 text-right">
                {d.pct.toFixed(1)}%
              </span>
            </div>
            {/* Mini-barre de poids — renforce visuellement l'allocation */}
            <div className="mt-1 ml-5 h-0.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, d.pct)}%`, backgroundColor: SCENARIO_COLORS[d.key] || "#6b7280" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { SCENARIO_LABELS, SCENARIO_COLORS };
