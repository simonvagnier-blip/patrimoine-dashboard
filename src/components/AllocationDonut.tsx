"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const SCENARIO_LABELS: Record<string, string> = {
  sp: "S&P 500", wd: "MSCI World", em: "Emerging Markets", nq: "Nasdaq-100",
  tech: "Tech/Growth", energy: "Énergie", crypto: "Crypto",
  fg: "Fonds garanti", fe: "Fonds euros", cash: "Cash",
};

const SCENARIO_COLORS: Record<string, string> = {
  sp: "#3b82f6", wd: "#34d399", em: "#f59e0b", nq: "#a78bfa",
  tech: "#38bdf8", energy: "#ef4444", crypto: "#f7931a",
  fg: "#6b7280", fe: "#9ca3af", cash: "#4b5563",
};

interface AllocationData {
  name: string;
  value: number;
  key: string;
  pct: number;
}

interface AllocationDonutProps {
  data: AllocationData[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AllocationData }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-sm">
      <p className="text-white font-medium">{d.name}</p>
      <p className="text-gray-300 font-[family-name:var(--font-jetbrains)]">
        {d.value.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
      </p>
      <p className="text-gray-400">{d.pct.toFixed(1)}%</p>
    </div>
  );
}

export default function AllocationDonut({ data }: AllocationDonutProps) {
  // R7: Interactive legend with highlight
  const [activeKey, setActiveKey] = useState<string | null>(null);

  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      <div className="w-[280px] h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={120}
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
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {data.map((d) => (
          <div
            key={d.key}
            className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-md cursor-pointer transition-all ${
              activeKey === d.key ? "bg-[#161b22]" : "hover:bg-[#161b22]/50"
            }`}
            onMouseEnter={() => setActiveKey(d.key)}
            onMouseLeave={() => setActiveKey(null)}
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: SCENARIO_COLORS[d.key] || "#6b7280" }}
            />
            <span className="text-gray-300 truncate flex-1">{d.name}</span>
            {/* R7: Show EUR amount + percentage */}
            <span className="text-gray-400 font-[family-name:var(--font-jetbrains)] text-xs whitespace-nowrap">
              {d.value.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </span>
            <span className="text-gray-500 font-[family-name:var(--font-jetbrains)] text-xs w-12 text-right">
              {d.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { SCENARIO_LABELS, SCENARIO_COLORS };
