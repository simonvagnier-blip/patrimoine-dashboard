"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * Courbe d'évolution du patrimoine — pièce maîtresse de la page (remplace
 * l'ancienne sparkline orpheline de la StatsBar). Réutilise la même donnée
 * `history` (snapshots quotidiens) déjà chargée par DashboardClient, avec un
 * sélecteur de période qui filtre côté client.
 */

interface Snap {
  date: string; // YYYY-MM-DD
  total_value: number;
}

const PERIODS: { key: string; days: number }[] = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "6M", days: 183 },
  { key: "1A", days: 366 },
  { key: "Max", days: Infinity },
];

function eur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: d });
}

export default function NetWorthChart({ history, hideAmounts = false }: { history: Snap[]; hideAmounts?: boolean }) {
  const [period, setPeriod] = useState("3M");

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const days = PERIODS.find((p) => p.key === period)?.days ?? Infinity;
  const cutoff =
    days === Infinity
      ? "0000-00-00"
      : new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const data = sorted
    .filter((s) => s.date >= cutoff && typeof s.total_value === "number" && s.total_value > 0)
    .map((s) => ({ date: s.date, value: s.total_value }));

  const first = data[0];
  const last = data[data.length - 1];
  const change = first && last ? last.value - first.value : 0;
  const changePct = first && first.value > 0 ? (change / first.value) * 100 : 0;
  const up = change >= 0;

  function fmtMonth(d: string): string {
    const [, m] = d.split("-").map(Number);
    return ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"][m - 1] ?? d;
  }

  return (
    <div className="bg-[#11161f] border border-gray-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Évolution</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <p className="text-sm text-gray-200">Patrimoine total</p>
            {data.length > 1 && (
              <span className={`text-xs font-[family-name:var(--font-jetbrains)] tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
                {up ? "▲" : "▼"} {hideAmounts ? "••••" : `${up ? "+" : ""}${eur(change)} (${up ? "+" : ""}${changePct.toFixed(1)}%)`}
              </span>
            )}
          </div>
        </div>
        <div className="flex border border-gray-800 rounded-md overflow-hidden text-[11px] shrink-0">
          {PERIODS.map((p, i) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 transition-colors ${i > 0 ? "border-l border-gray-800" : ""} ${
                period === p.key ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white hover:bg-[#161b22]"
              }`}
            >
              {p.key}
            </button>
          ))}
        </div>
      </div>

      {data.length < 2 ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-gray-600">
          Pas encore assez d&apos;historique sur cette période
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={fmtMonth}
              tick={{ fontSize: 11, fill: "#5b6573" }}
              axisLine={false}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis hide domain={["dataMin - 1500", "dataMax + 1500"]} />
            <RTooltip
              contentStyle={{
                backgroundColor: "#161b22",
                border: "1px solid #2a3441",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#9ca3af" }}
              labelFormatter={(d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              formatter={(v) => [hideAmounts ? "••••" : eur(Number(v)), "Patrimoine"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#34d399"
              strokeWidth={2.5}
              fill="url(#nwGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#34d399", stroke: "#0d1117", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
