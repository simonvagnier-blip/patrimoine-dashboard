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
  Line,
  ComposedChart,
} from "recharts";
import type { ScenarioResult } from "@/lib/simulation";

export interface HistoryPoint {
  date: string;
  total_value: number;
  invested_total?: number | null;
}

interface ProjectionChartProps {
  results: ScenarioResult[];
  horizonYears: number;
  currentAge: number;
  retireAge: number;
  history?: HistoryPoint[];
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
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  // Filter out null/undefined values
  const validEntries = payload.filter((e) => e.value != null);

  return (
    <div className="bg-[#161b22] border border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl">
      <p className="text-gray-300 font-medium mb-2">{label}</p>
      {validEntries.map((entry) => (
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
  history,
}: ProjectionChartProps) {
  // Build history data points (monthly samples to avoid clutter)
  const historyByMonth: Record<string, number> = {};
  if (history && history.length > 0) {
    for (const h of history) {
      // Group by month (YYYY-MM)
      const monthKey = h.date.slice(0, 7);
      historyByMonth[monthKey] = h.total_value; // last value of the month wins
    }
  }

  const historyMonths = Object.keys(historyByMonth).sort();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed

  // Build invested history by month (same grouping)
  const investedByMonth: Record<string, number | null> = {};
  if (history && history.length > 0) {
    for (const h of history) {
      const monthKey = h.date.slice(0, 7);
      investedByMonth[monthKey] = h.invested_total ?? null;
    }
  }

  // Build chart data: history months + projection years
  const chartData: Record<string, string | number | null>[] = [];

  // Add history points
  for (const monthKey of historyMonths) {
    const [y, m] = monthKey.split("-").map(Number);
    // Calculate fractional years before today
    const monthsDiff = (currentYear - y) * 12 + (currentMonth - (m - 1));
    const yearsDiff = monthsDiff / 12;
    const age = currentAge - yearsDiff;

    chartData.push({
      year: `${Math.round(age)} ans`,
      label: monthKey,
      history: Math.round(historyByMonth[monthKey]),
      history_invested: investedByMonth[monthKey] != null ? Math.round(investedByMonth[monthKey]!) : null,
      o: null,
      m: null,
      p: null,
      invested: null,
      _isHistory: 1,
    });
  }

  // Add projection data points (starting from year 0 = now)
  for (let y = 0; y <= horizonYears; y++) {
    const entry: Record<string, string | number | null> = {
      year: `${currentAge + y} ans`,
      label: `+${y}`,
      history: null,
      _isHistory: 0,
    };

    // Connect history to projection: year 0 gets the history value too
    if (y === 0 && history && history.length > 0) {
      entry.history = Math.round(history[history.length - 1].total_value);
      const lastInvested = history[history.length - 1].invested_total;
      entry.history_invested = lastInvested != null ? Math.round(lastInvested) : null;
    }

    for (const r of results) {
      entry[r.scenario] = Math.round(r.totals[y]);
    }

    if (results[0]) {
      entry["invested"] = Math.round(results[0].invested[y]);
    }

    chartData.push(entry);
  }

  // Find the "today" index for the reference line
  const todayLabel = `${currentAge} ans`;

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="year"
            stroke="#6b7280"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            interval={Math.max(0, Math.floor(chartData.length / 10) - 1)}
          />
          <YAxis
            stroke="#6b7280"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            tickFormatter={formatK}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Historical real line */}
          <Line
            type="monotone"
            dataKey="history"
            name="Historique réel"
            stroke="#ffffff"
            strokeWidth={2.5}
            dot={false}
            connectNulls={true}
          />

          {/* Historical invested capital line */}
          <Line
            type="monotone"
            dataKey="history_invested"
            name="Capital investi (réel)"
            stroke="#6b7280"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
            connectNulls={true}
          />

          {/* Optimiste */}
          <Area
            type="monotone"
            dataKey="o"
            name={SCENARIO_LABELS.o}
            stroke={SCENARIO_COLORS.o}
            fill={SCENARIO_COLORS.o}
            fillOpacity={0.1}
            strokeWidth={2}
            connectNulls={false}
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
            connectNulls={false}
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
            connectNulls={false}
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
            connectNulls={false}
          />

          {/* Today line */}
          {history && history.length > 0 && (
            <ReferenceLine
              x={todayLabel}
              stroke="#ffffff"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
              label={{
                value: "Aujourd'hui",
                fill: "#9ca3af",
                fontSize: 11,
                position: "top",
              }}
            />
          )}

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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
