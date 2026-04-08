"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AllocationDonut, { SCENARIO_LABELS } from "./AllocationDonut";
import PositionTable from "./PositionTable";
import ExportPDF from "./ExportPDF";
import Link from "next/link";
import type { QuotesResult } from "@/lib/quotes";
import { LineChart, Line, ResponsiveContainer, Tooltip as RTooltip } from "recharts";

interface Envelope {
  id: string;
  name: string;
  type: string;
  color: string;
  target: number | null;
  fill_end_year: number | null;
  annual_contrib: number | null;
}

interface Position {
  id: number;
  envelope_id: string;
  ticker: string;
  yahoo_ticker: string | null;
  label: string;
  isin: string | null;
  quantity: number | null;
  pru: number | null;
  manual_value: number | null;
  scenario_key: string;
  currency: string;
}

interface DashboardClientProps {
  envelopes: Envelope[];
  positions: Position[];
}

function computePositionValue(
  pos: Position,
  quotes: QuotesResult | null
): {
  current_price: number | null;
  current_value: number;
  pnl: number | null;
  pnl_pct: number | null;
} {
  if (pos.manual_value !== null) {
    return { current_price: null, current_value: pos.manual_value, pnl: null, pnl_pct: null };
  }
  if (!pos.quantity || !pos.pru) {
    return { current_price: null, current_value: 0, pnl: null, pnl_pct: null };
  }
  const quote = pos.yahoo_ticker && quotes?.quotes[pos.yahoo_ticker];
  const eurUsd = quotes?.eurUsd ?? 1.08;
  if (quote) {
    const price = quote.price;
    const valueEur = pos.currency === "USD" ? (pos.quantity * price) / eurUsd : pos.quantity * price;
    const costBasis = pos.quantity * pos.pru;
    const costBasisEur = pos.currency === "USD" ? costBasis / eurUsd : costBasis;
    const pnl = valueEur - costBasisEur;
    const pnl_pct = costBasisEur > 0 ? (pnl / costBasisEur) * 100 : 0;
    return { current_price: price, current_value: valueEur, pnl, pnl_pct };
  }
  const fallback = pos.quantity * pos.pru;
  const fallbackEur = pos.currency === "USD" ? fallback / eurUsd : fallback;
  return { current_price: null, current_value: fallbackEur, pnl: null, pnl_pct: null };
}

function formatEur(v: number, decimals = 0): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: decimals });
}

interface Snapshot { date: string; total_value: number; }

export default function DashboardClient({ envelopes, positions }: DashboardClientProps) {
  const [quotes, setQuotes] = useState<QuotesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");
  const [envelopeFilter, setEnvelopeFilter] = useState<string | null>(null);
  const [quotesError, setQuotesError] = useState(false);
  // F1: History
  const [history, setHistory] = useState<Snapshot[]>([]);
  // F4: Weekly summary
  const [summaryDismissed, setSummaryDismissed] = useState(false);

  const fetchQuotes = useCallback(async (refresh = false) => {
    setLoading(true);
    setQuotesError(false);
    try {
      const url = refresh ? "/api/quotes?refresh=true" : "/api/quotes";
      const res = await fetch(url);
      if (res.ok) {
        const data: QuotesResult = await res.json();
        setQuotes(data);
        setLastUpdate(new Date(data.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      } else {
        setQuotesError(true);
      }
    } catch (err) {
      console.error("Failed to fetch quotes:", err);
      setQuotesError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // F1: Fetch history
  useEffect(() => {
    fetch("/api/snapshots?days=90").then((r) => r.ok ? r.json() : []).then(setHistory).catch(() => {});
  }, []);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const enrichedPositions = positions.map((pos) => {
    const computed = computePositionValue(pos, quotes);
    const env = envelopes.find((e) => e.id === pos.envelope_id)!;
    return { ...pos, ...computed, envelope_name: env.name, envelope_color: env.color, weight: 0 };
  });

  const grandTotal = enrichedPositions.reduce((sum, p) => sum + p.current_value, 0);

  // R1: Global P&L
  const totalPnl = enrichedPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const totalCostBasis = enrichedPositions.reduce((sum, p) => {
    if (p.pnl !== null) return sum + (p.current_value - p.pnl);
    return sum;
  }, 0);
  const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;
  const hasQuotes = quotes !== null;

  // F1: Save snapshot when quotes are loaded
  useEffect(() => {
    if (!hasQuotes || grandTotal <= 0) return;
    const details: Record<string, number> = {};
    for (const env of envelopes) {
      details[env.id] = enrichedPositions.filter((p) => p.envelope_id === env.id).reduce((s, p) => s + p.current_value, 0);
    }
    fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_value: grandTotal, details }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasQuotes]);

  // F4: Weekly summary data
  const prevSnapshot = history.length > 1 ? history[history.length - 2] : null;
  const deltaValue = prevSnapshot ? grandTotal - prevSnapshot.total_value : null;
  const deltaPct = prevSnapshot && prevSnapshot.total_value > 0 ? (deltaValue! / prevSnapshot.total_value) * 100 : null;
  const daysSinceLast = prevSnapshot ? Math.round((Date.now() - new Date(prevSnapshot.date).getTime()) / 86400000) : null;

  const envelopeData = envelopes.map((env) => {
    const envPositions = enrichedPositions.filter((p) => p.envelope_id === env.id);
    const total = envPositions.reduce((sum, p) => sum + p.current_value, 0);
    return { ...env, total, positionCount: envPositions.length };
  });

  const allocationMap: Record<string, number> = {};
  for (const pos of enrichedPositions) {
    allocationMap[pos.scenario_key] = (allocationMap[pos.scenario_key] || 0) + pos.current_value;
  }
  const allocationData = Object.entries(allocationMap)
    .map(([key, value]) => ({
      key,
      name: SCENARIO_LABELS[key] || key,
      value,
      pct: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // R9: Filtered positions
  const filteredPositions = enrichedPositions
    .filter((p) => !envelopeFilter || p.envelope_id === envelopeFilter)
    .map((p) => ({ ...p, weight: grandTotal > 0 ? (p.current_value / grandTotal) * 100 : 0 }));

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Patrimoine</h1>
            <p className="text-gray-400 mt-1">Vue consolidée</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-400">Total estimé</p>
              {/* R6: Skeleton while loading */}
              {loading && !hasQuotes ? (
                <div className="h-9 w-36 bg-gray-800 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-3xl font-bold text-white font-[family-name:var(--font-jetbrains)]">
                  {formatEur(grandTotal)}
                </p>
              )}
              {/* R1: Global P&L */}
              {hasQuotes && (
                <p className={`text-sm font-[family-name:var(--font-jetbrains)] mt-0.5 ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalPnl >= 0 ? "+" : ""}{formatEur(totalPnl)}
                  <span className="text-xs ml-1">
                    ({totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)
                  </span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <ExportPDF grandTotal={grandTotal} envelopeData={envelopeData} positions={enrichedPositions} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchQuotes(true)}
                  disabled={loading}
                  className="border-gray-700 text-gray-300 hover:bg-[#161b22] hover:text-white"
                >
                  {loading ? "Chargement..." : "Actualiser"}
                </Button>
              </div>
              {lastUpdate && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-gray-500">MAJ {lastUpdate}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {quotesError && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-red-300">Impossible de récupérer les cours. Les valeurs affichées sont basées sur le PRU.</p>
            <Button variant="outline" size="sm" onClick={() => fetchQuotes(true)} className="border-red-700 text-red-300 hover:bg-red-900/30 shrink-0 ml-3">
              Réessayer
            </Button>
          </div>
        )}

        {/* F4: Weekly summary banner */}
        {hasQuotes && deltaValue !== null && daysSinceLast !== null && daysSinceLast >= 1 && !summaryDismissed && (
          <div className="bg-[#0d1117] border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-gray-300">
              Depuis votre dernière visite ({daysSinceLast}j) :
              <span className={`font-[family-name:var(--font-jetbrains)] ml-2 ${deltaValue >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {deltaValue >= 0 ? "+" : ""}{formatEur(deltaValue)} ({deltaPct !== null ? (deltaPct >= 0 ? "+" : "") + deltaPct.toFixed(1) + "%" : ""})
              </span>
            </p>
            <button onClick={() => setSummaryDismissed(true)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">&times;</button>
          </div>
        )}

        {/* F1: Sparkline history */}
        {history.length > 2 && (
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.map((s) => ({ date: s.date, value: s.total_value }))}>
                <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={1.5} dot={false} />
                <RTooltip
                  contentStyle={{ backgroundColor: "#161b22", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "#9ca3af" }}
                  formatter={(v) => [formatEur(Number(v)), "Total"]}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Envelope Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {envelopeData.map((env) => (
            <Link key={env.id} href={`/envelope/${env.id}`}>
              <Card className="bg-[#0d1117] border-gray-800 hover:border-gray-600 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400 flex items-center">
                    <span className="inline-block w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: env.color }} />
                    <span className="truncate">{env.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading && !hasQuotes ? (
                    <div className="h-7 w-24 bg-gray-800 rounded animate-pulse" />
                  ) : (
                    <p className="text-xl font-bold font-[family-name:var(--font-jetbrains)]" style={{ color: env.color }}>
                      {formatEur(env.total)}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">
                      {env.positionCount} ligne{env.positionCount > 1 ? "s" : ""}
                    </span>
                    {grandTotal > 0 && (
                      <span className="text-xs text-gray-500 font-[family-name:var(--font-jetbrains)]">
                        {((env.total / grandTotal) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ backgroundColor: env.color, width: `${grandTotal > 0 ? (env.total / grandTotal) * 100 : 0}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Allocation Donut */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Répartition par classe d&apos;actifs</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationDonut data={allocationData} />
          </CardContent>
        </Card>

        {/* R9: Positions Table with filters */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              Toutes les positions
              <span className="text-sm font-normal text-gray-400 ml-2">
                ({filteredPositions.length} lignes)
              </span>
            </CardTitle>
            {/* R9: Envelope filter badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge
                variant={envelopeFilter === null ? "default" : "outline"}
                className={`cursor-pointer text-xs ${envelopeFilter === null ? "bg-gray-700 text-white" : "border-gray-700 text-gray-400 hover:text-white"}`}
                onClick={() => setEnvelopeFilter(null)}
              >
                Toutes
              </Badge>
              {envelopes.map((env) => (
                <Badge
                  key={env.id}
                  variant={envelopeFilter === env.id ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  style={
                    envelopeFilter === env.id
                      ? { backgroundColor: env.color + "22", color: env.color, borderColor: env.color }
                      : { borderColor: "#374151", color: "#9ca3af" }
                  }
                  onClick={() => setEnvelopeFilter(envelopeFilter === env.id ? null : env.id)}
                >
                  {env.name}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <PositionTable positions={filteredPositions} grandTotal={grandTotal} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
