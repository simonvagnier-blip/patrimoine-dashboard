"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ScenarioResult } from "@/lib/simulation";

interface ProjectionChartProps {
  results: ScenarioResult[];
  horizonYears: number;
  currentAge: number;
  retireAge: number;
}

const SCENARIO_COLORS = {
  p: "#f87171",
  m: "#fbbf24",
  o: "#34d399",
};

const SCENARIO_LABELS = {
  p: "Pessimiste",
  m: "Modéré",
  o: "Optimiste",
};

function formatK(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + " M€";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + " k€";
  return v.toFixed(0) + " €";
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-[#161b22] border border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl">
      <p className="text-gray-300 font-medium mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-400">{entry.name} :</span>
          <span className="text-white font-[family-name:var(--font-jetbrains)]">
            {entry.value.toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ProjectionChart({
  results,
  horizonYears,
  currentAge,
  retireAge,
}: ProjectionChartProps) {
  // Build chart data: one entry per year
  const chartData = [];
  for (let y = 0; y <= horizonYears; y++) {
    const entry: Record<string, string | number> = {
      year: `${currentAge + y} ans`,
      label: `+${y}`,
    };

    for (const r of results) {
      entry[r.scenario] = Math.round(r.totals[y]);
    }

    // Invested (same across scenarios)
    if (results[0]) {
      entry["invested"] = Math.round(results[0].invested[y]);
    }

    chartData.push(entry);
  }

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="year"
            stroke="#6b7280"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            interval={Math.max(0, Math.floor(horizonYears / 8) - 1)}
          />
          <YAxis
            stroke="#6b7280"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            tickFormatter={formatK}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Optimiste */}
          <Area
            type="monotone"
            dataKey="o"
            name={SCENARIO_LABELS.o}
            stroke={SCENARIO_COLORS.o}
            fill={SCENARIO_COLORS.o}
            fillOpacity={0.1}
            strokeWidth={2}
          />

          {/* Modéré */}
          <Area
            type="monotone"
            dataKey="m"
            name={SCENARIO_LABELS.m}
            stroke={SCENARIO_COLORS.m}
            fill={SCENARIO_COLORS.m}
            fillOpacity={0.15}
            strokeWidth={2}
          />

          {/* Pessimiste */}
          <Area
            type="monotone"
            dataKey="p"
            name={SCENARIO_LABELS.p}
            stroke={SCENARIO_COLORS.p}
            fill={SCENARIO_COLORS.p}
            fillOpacity={0.1}
            strokeWidth={2}
          />

          {/* Invested dashed line */}
          <Area
            type="monotone"
            dataKey="invested"
            name="Capital investi"
            stroke="#6b7280"
            strokeDasharray="6 4"
            fill="none"
            strokeWidth={1.5}
          />

          {/* Retirement line */}
          <ReferenceLine
            x={`${retireAge} ans`}
            stroke="#4b5563"
            strokeDasharray="4 4"
            label={{
              value: "Retraite",
              fill: "#6b7280",
              fontSize: 11,
              position: "top",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
