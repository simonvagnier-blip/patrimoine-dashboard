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

function formatEur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
  });
}

export default function EnvelopeChartPanel({
  envelopeId,
  color,
}: {
  envelopeId: string;
  color: string;
}) {
  const [range, setRange] = useState("1mo");
  const [mode, setMode] = useState<"simulated" | "real">("simulated");
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!envelopeId) return;
    setLoading(true);
    fetch(
      `/api/envelope-chart?id=${encodeURIComponent(envelopeId)}&range=${range}&mode=${mode}`
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ChartPoint[]) => {
        setPoints(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [envelopeId, range, mode]);

  const closes = points.map((p) => p.close);
  const isUp =
    closes.length >= 2 ? closes[closes.length - 1] >= closes[0] : true;
  // Use the envelope's accent color when the period is neutral/up, red on down.
  const strokeColor = isUp ? color : "#f87171";
  const gradientId = `env-grad-${envelopeId.replace(/[^a-zA-Z0-9]/g, "")}`;

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

  const hasData = !loading && points.length >= 2;

  return (
    <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-medium text-gray-300">
            Évolution de l&apos;enveloppe
          </h3>
          {/* Mode toggle: simulated (retroactive qty × historical price) vs
              real (stored daily snapshots, start empty, fill over time). */}
          <div className="flex items-center rounded-md bg-[#161b22] border border-gray-800 overflow-hidden">
            <button
              onClick={() => setMode("simulated")}
              className={`px-2.5 py-1 text-[11px] transition-colors ${
                mode === "simulated"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Simulé : applique les quantités actuelles aux prix historiques"
            >
              Simulé
            </button>
            <button
              onClick={() => setMode("real")}
              className={`px-2.5 py-1 text-[11px] transition-colors ${
                mode === "real"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Réel : historique des valorisations quotidiennes (démarre vide, se remplit chaque jour)"
            >
              Réel
            </button>
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
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
        </div>
        {hasData && (
          <div className="flex items-center gap-3 text-xs font-[family-name:var(--font-jetbrains)]">
            <span className="text-gray-500">
              J{" "}
              <span
                className={
                  dailyChange >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                {dailyChange >= 0 ? "+" : ""}
                {formatEur(dailyChange)} ({dailyChangePct >= 0 ? "+" : ""}
                {dailyChangePct.toFixed(2)}%)
              </span>
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">
              Période{" "}
              <span
                className={
                  periodChange >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                {periodChange >= 0 ? "+" : ""}
                {formatEur(periodChange)} ({periodChangePct >= 0 ? "+" : ""}
                {periodChangePct.toFixed(2)}%)
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="h-[180px]">
        {loading ? (
          <div className="h-full w-full bg-gray-800/30 rounded animate-pulse" />
        ) : points.length < 2 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-gray-600 px-4 text-center">
            {mode === "real" ? (
              <>
                <span>
                  Historique réel en cours de collecte
                  {points.length === 1 ? " (1 point)" : ""}.
                </span>
                <span className="text-gray-700">
                  Un nouveau point est enregistré chaque soir. Utilisez{" "}
                  <button
                    onClick={() => setMode("simulated")}
                    className="underline hover:text-gray-400"
                  >
                    Simulé
                  </button>{" "}
                  en attendant.
                </span>
              </>
            ) : (
              <span>Pas de données disponibles</span>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
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
                width={65}
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
                formatter={(v: unknown) => [formatEur(Number(v)), "Valeur"]}
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
                stroke={strokeColor}
                strokeWidth={1.75}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: strokeColor,
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
