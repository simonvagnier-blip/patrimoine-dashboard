"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface BenchmarkResponse {
  envelope_id: string;
  benchmark: { key: string; label: string; ticker: string };
  available: Array<{ key: string; label: string }>;
  days: number;
  twr_pct: number | null;
  twr_annualized_pct: number | null;
  benchmark_pct: number | null;
  benchmark_error: string | null;
  error?: string;
  points: Array<{ date: string; portfolio_pct: number; benchmark_pct: number | null }>;
}

const PERIODS = [
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
  { days: 180, label: "6M" },
  { days: 365, label: "1A" },
  { days: 3650, label: "Max" },
];

/**
 * « Est-ce que je bats le marché ? » — TWR de l'enveloppe (apports
 * neutralisés) vs un ETF indiciel EUR, rebasés à 0 % à la même date.
 */
export default function BenchmarkPanel({
  envelopeId,
  color = "#34d399",
}: {
  envelopeId: string;
  color?: string;
}) {
  const [days, setDays] = useState(90);
  const [index, setIndex] = useState<string | null>(null); // null = défaut serveur
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = `/api/envelope-benchmark?envelope_id=${envelopeId}&days=${days}${index ? `&index=${index}` : ""}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BenchmarkResponse | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [envelopeId, days, index]);

  const delta =
    data?.twr_pct !== null && data?.twr_pct !== undefined && data?.benchmark_pct !== null && data?.benchmark_pct !== undefined
      ? data.twr_pct - data.benchmark_pct
      : null;

  return (
    <Card className="bg-[#0d1117] border-gray-800">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Performance</p>
            <CardTitle className="text-sm text-gray-200 font-medium">
              Vs {data?.benchmark.label ?? "indice"}
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={index ?? data?.benchmark.key ?? "world"}
              onChange={(e) => setIndex(e.target.value)}
              aria-label="Indice de référence"
              className="bg-[#161b22] border border-gray-700 text-gray-300 rounded-md px-2 py-1.5 text-xs"
            >
              {(data?.available ?? [{ key: "world", label: "MSCI World" }]).map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
            </select>
            <div className="flex rounded-md bg-[#161b22] border border-gray-700 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setDays(p.days)}
                  aria-pressed={days === p.days}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                    days === p.days ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[260px] bg-gray-800/40 rounded-lg animate-pulse" aria-hidden="true" />
        ) : !data || data.error || data.points.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-sm text-gray-500 text-center px-6">
            {data?.error ?? "Comparaison indisponible pour cette enveloppe."}
          </div>
        ) : (
          <>
            {/* Verdict */}
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3 font-[family-name:var(--font-jetbrains)] tabular-nums">
              <span className="text-sm">
                <span className="text-gray-400 mr-1.5">Toi (TWR)</span>
                <span className="font-bold" style={{ color }}>
                  {data.twr_pct !== null ? `${data.twr_pct >= 0 ? "+" : ""}${data.twr_pct.toFixed(1)} %` : "n/c"}
                </span>
              </span>
              <span className="text-sm">
                <span className="text-gray-400 mr-1.5">{data.benchmark.label}</span>
                <span className="font-bold text-violet-400">
                  {data.benchmark_pct !== null ? `${data.benchmark_pct >= 0 ? "+" : ""}${data.benchmark_pct.toFixed(1)} %` : "n/c"}
                </span>
              </span>
              {delta !== null && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    delta >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}
                  title="Écart TWR portefeuille − indice sur la période"
                >
                  {delta >= 0 ? "▲ tu bats l'indice de " : "▼ l'indice te bat de "}
                  {Math.abs(delta).toFixed(1)} pt
                </span>
              )}
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#5a6475", fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5).replace("-", "/")}
                  minTickGap={40}
                  axisLine={{ stroke: "#1e2633" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#5a6475", fontSize: 10 }}
                  tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                />
                <ReferenceLine y={0} stroke="#1e2633" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#161b22", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#9ca3af" }}
                  formatter={(value, name) => [
                    `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)} %`,
                    name === "portfolio_pct" ? "Toi (TWR)" : data.benchmark.label,
                  ]}
                />
                <Line type="monotone" dataKey="portfolio_pct" stroke={color} strokeWidth={2.2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="benchmark_pct"
                  stroke="#a78bfa"
                  strokeWidth={1.8}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>

            {data.benchmark_error && (
              <p className="text-xs text-amber-400/80 mt-2">Indice indisponible (Yahoo) : courbe portefeuille seule.</p>
            )}
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              TWR = performance à apports neutralisés (comparable à un indice). Ton TRI, lui, intègre le
              timing de tes versements — l&apos;écart entre les deux mesure cet effet.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
