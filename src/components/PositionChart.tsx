"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartPoint {
  date: string;
  close: number;
}

const RANGES = [
  { key: "1w", label: "1S" },
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1A" },
];

function formatPrice(v: number): string {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PositionChartPanel({
  ticker,
  currency = "EUR",
  quantity = 1,
}: {
  ticker: string;
  currency?: string;
  quantity?: number;
}) {
  const [range, setRange] = useState("1mo");
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=${range}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ChartPoint[]) => {
        setPoints(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticker, range]);

  const closes = points.map((p) => p.close);
  const isUp =
    closes.length >= 2 ? closes[closes.length - 1] >= closes[0] : true;
  const color = isUp ? "#34d399" : "#f87171";
  const gradientId = `grad-${ticker.replace(/[^a-zA-Z0-9]/g, "")}`;
  const sym = currency === "USD" ? "$" : "€";

  // Period change (first → last)
  const periodChange =
    closes.length >= 2 ? closes[closes.length - 1] - closes[0] : 0;
  const periodChangePct =
    closes.length >= 2 && closes[0] > 0
      ? (periodChange / closes[0]) * 100
      : 0;

  // Daily change (penultimate → last)
  const dailyChange =
    closes.length >= 2
      ? closes[closes.length - 1] - closes[closes.length - 2]
      : 0;
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : 0;
  const dailyChangePct = prevClose > 0 ? (dailyChange / prevClose) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Range selector + period stats */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={(e) => {
                e.stopPropagation();
                setRange(r.key);
              }}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                range === r.key
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {closes.length >= 2 && (
          <div className="flex items-center gap-3 text-xs font-[family-name:var(--font-jetbrains)]">
            <span className="text-gray-500">
              J{" "}
              <span
                className={
                  dailyChange >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                {dailyChange >= 0 ? "+" : ""}
                {formatPrice(dailyChange * quantity)} {sym} ({dailyChangePct >= 0 ? "+" : ""}
                {dailyChangePct.toFixed(2)}%)
              </span>
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">
              Période{" "}
              <span className={isUp ? "text-emerald-400" : "text-red-400"}>
                {periodChange >= 0 ? "+" : ""}
                {formatPrice(periodChange * quantity)} {sym} ({periodChangePct >= 0 ? "+" : ""}
                {periodChangePct.toFixed(2)}%)
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-[140px]">
        {loading ? (
          <div className="h-full w-full bg-gray-800/30 rounded animate-pulse" />
        ) : points.length < 2 ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-600">
            Pas de données disponibles
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#4b5563" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(d: string) => {
                  const date = new Date(d);
                  return `${date.getDate()}/${date.getMonth() + 1}`;
                }}
                minTickGap={40}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "#4b5563" }}
                tickLine={false}
                axisLine={false}
                width={55}
                tickFormatter={(v: number) =>
                  v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#161b22",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(v: unknown) => [
                  `${formatPrice(Number(v))} ${sym}`,
                  "Cours",
                ]}
                labelFormatter={(d: unknown) => {
                  const date = new Date(String(d));
                  return date.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: color,
                  stroke: "#0d1117",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
