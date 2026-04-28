"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/**
 * LOT 6 — Page What-if interactive.
 *
 * UI split en 2 zones :
 *   - Gauche : pour chaque enveloppe, inputs apport mensuel additionnel et
 *     boost initial. Sélecteur d'horizon. Sélecteur de scenario à afficher.
 *   - Droite : graphique baseline vs what-if + tableau deltas aux horizons clés.
 *
 * Preset : "Utiliser ma capacité d'épargne mensuelle" (du Lot 5) → distribue
 * l'épargne moyenne sur le PEA (jusqu'au plafond) puis sur les autres.
 */

interface Envelope {
  id: string;
  name: string;
  type: string;
  color: string;
}

interface KeyHorizon {
  years_from_now: number;
  age: number;
  baseline_total_eur: number;
  whatif_total_eur: number;
  delta_eur: number;
  delta_pct: number;
}

interface WhatIfScenario {
  key: "p" | "m" | "o";
  label: string;
  baseline_totals: number[];
  whatif_totals: number[];
  baseline_invested: number[];
  whatif_invested: number[];
  delta_at_horizon_eur: number;
  delta_at_horizon_pct: number;
  key_horizons: KeyHorizon[];
}

interface WhatIfResult {
  fetched_at: string;
  current_age: number;
  retire_age: number;
  horizon_years: number;
  scenarios: WhatIfScenario[];
}

function eur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
  });
}

const SCENARIO_COLORS: Record<string, string> = {
  p: "#f87171",
  m: "#34d399",
  o: "#60a5fa",
};

export default function WhatIfClient({ envelopes }: { envelopes: Envelope[] }) {
  // Inputs : apport mensuel additionnel + boost initial par enveloppe
  const [extras, setExtras] = useState<
    Record<string, { monthly: string; boost: string }>
  >(() => {
    const o: Record<string, { monthly: string; boost: string }> = {};
    for (const e of envelopes) o[e.id] = { monthly: "", boost: "" };
    return o;
  });
  const [horizon, setHorizon] = useState(20);
  const [activeScenario, setActiveScenario] = useState<"p" | "m" | "o">("m");
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [running, setRunning] = useState(false);
  const [savingsHint, setSavingsHint] = useState<number | null>(null);

  // Charger la capacité d'épargne mensuelle moyenne du Lot 5 pour le preset
  useEffect(() => {
    fetch("/api/budget/summary?months=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const avg = d?.averages?.avg_savings_eur;
        if (typeof avg === "number" && avg > 0) setSavingsHint(avg);
      })
      .catch(() => {});
  }, []);

  // Simuler au montage avec params vides (= baseline pure, pour avoir un repère)
  useEffect(() => {
    void runSim({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSim(extrasOverride?: Record<string, { monthly: string; boost: string }>) {
    setRunning(true);
    try {
      const src = extrasOverride ?? extras;
      const envelope_extras: Record<string, { monthly_contrib?: number; initial_boost?: number }> = {};
      for (const [id, v] of Object.entries(src)) {
        const m = parseFloat(v.monthly);
        const b = parseFloat(v.boost);
        const ent: { monthly_contrib?: number; initial_boost?: number } = {};
        if (!isNaN(m) && m > 0) ent.monthly_contrib = m;
        if (!isNaN(b) && b > 0) ent.initial_boost = b;
        if (Object.keys(ent).length > 0) envelope_extras[id] = ent;
      }
      const res = await fetch("/api/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon_years: horizon, envelope_extras }),
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setRunning(false);
    }
  }

  function applySavingsPreset() {
    if (!savingsHint) return;
    // Mettre tout sur le PEA tant que le plafond fill_end_year n'est pas
    // atteint (l'utilisateur peut ensuite répartir manuellement).
    const pea = envelopes.find((e) => e.type === "pea");
    const target = pea?.id ?? envelopes.find((e) => e.type === "cto")?.id;
    if (!target) return;
    const next = { ...extras };
    next[target] = { ...next[target], monthly: String(Math.round(savingsHint)) };
    setExtras(next);
    void runSim(next);
  }

  function clearAll() {
    const next: typeof extras = {};
    for (const e of envelopes) next[e.id] = { monthly: "", boost: "" };
    setExtras(next);
    setResult(null);
    void runSim(next);
  }

  function update(envId: string, field: "monthly" | "boost", value: string) {
    setExtras({ ...extras, [envId]: { ...extras[envId], [field]: value } });
  }

  const activeData = useMemo(() => {
    if (!result) return null;
    return result.scenarios.find((s) => s.key === activeScenario) ?? null;
  }, [result, activeScenario]);

  const chartData = useMemo(() => {
    if (!activeData) return [];
    const points: Array<{ year: number; baseline: number; whatif: number }> = [];
    for (let y = 0; y <= activeData.baseline_totals.length - 1; y++) {
      points.push({
        year: y,
        baseline: activeData.baseline_totals[y],
        whatif: activeData.whatif_totals[y],
      });
    }
    return points;
  }, [activeData]);

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/perso/patrimoine"
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            Patrimoine
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300">What-if</span>
        </nav>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Simulations What-if</h1>
          <p className="text-sm text-gray-400 mt-1">
            Test l&apos;impact long terme d&apos;apports additionnels ou de transferts
            sur ton patrimoine. Compare baseline vs nouveau scenario.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Inputs (gauche) */}
          <Card className="bg-[#0d1117] border-gray-800 lg:col-span-5 h-fit">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-300">
                  Modifications par enveloppe
                </h2>
                <button
                  onClick={clearAll}
                  className="text-[11px] text-gray-500 hover:text-gray-300 underline"
                >
                  Tout effacer
                </button>
              </div>

              {/* Preset capacité d'épargne */}
              {savingsHint && savingsHint > 0 && (
                <button
                  onClick={applySavingsPreset}
                  className="w-full text-left bg-emerald-900/10 border border-emerald-700/30 rounded-md px-3 py-2 text-xs text-emerald-200 hover:border-emerald-600 transition-colors"
                >
                  💡 <span className="font-medium">Preset</span> : utiliser ma
                  capacité d&apos;épargne moyenne ({eur(savingsHint)}/mois) sur le
                  PEA
                </button>
              )}

              {/* Inputs par enveloppe */}
              <div className="space-y-2">
                {envelopes.map((env) => (
                  <div
                    key={env.id}
                    className="bg-[#161b22] rounded-md p-2.5 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: env.color }}
                      />
                      <span className="text-sm text-white">{env.name}</span>
                      <span className="text-[10px] text-gray-600 uppercase">
                        {env.type}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-gray-500">
                          Apport mensuel +
                        </Label>
                        <Input
                          type="number"
                          step="50"
                          value={extras[env.id]?.monthly ?? ""}
                          onChange={(e) =>
                            update(env.id, "monthly", e.target.value)
                          }
                          placeholder="0 €/mois"
                          className="bg-[#0d1117] border-gray-700 text-white text-sm h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-500">
                          Boost initial
                        </Label>
                        <Input
                          type="number"
                          step="500"
                          value={extras[env.id]?.boost ?? ""}
                          onChange={(e) =>
                            update(env.id, "boost", e.target.value)
                          }
                          placeholder="0 € t=0"
                          className="bg-[#0d1117] border-gray-700 text-white text-sm h-8"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Horizon + run */}
              <div className="flex items-end gap-3 border-t border-gray-800 pt-3">
                <div className="flex-1">
                  <Label className="text-xs text-gray-400">Horizon (années)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={horizon}
                    onChange={(e) =>
                      setHorizon(parseInt(e.target.value) || 20)
                    }
                    className="bg-[#0d1117] border-gray-700 text-white text-sm"
                  />
                </div>
                <Button
                  onClick={() => runSim()}
                  disabled={running}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {running ? "..." : "Simuler"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Résultats (droite) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Scenario tabs */}
            <div className="flex items-center gap-1 bg-[#0d1117] border border-gray-800 rounded-md p-1 w-fit">
              {(["p", "m", "o"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setActiveScenario(s)}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    activeScenario === s
                      ? "bg-gray-700 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  style={{
                    color:
                      activeScenario === s ? SCENARIO_COLORS[s] : undefined,
                  }}
                >
                  {s === "p" ? "Pessimiste" : s === "m" ? "Modéré" : "Optimiste"}
                </button>
              ))}
            </div>

            {!result || !activeData ? (
              <div className="h-64 bg-gray-800/30 rounded-lg animate-pulse" />
            ) : (
              <>
                {/* Delta hero */}
                <Card className="bg-[#0d1117] border-gray-800">
                  <CardContent className="pt-4 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">
                        Δ à l&apos;horizon ({horizon}a)
                      </p>
                      <p
                        className={`text-2xl font-bold font-[family-name:var(--font-jetbrains)] mt-1 ${
                          activeData.delta_at_horizon_eur >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {activeData.delta_at_horizon_eur >= 0 ? "+" : ""}
                        {eur(activeData.delta_at_horizon_eur)}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {activeData.delta_at_horizon_pct >= 0 ? "+" : ""}
                        {activeData.delta_at_horizon_pct.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">
                        Baseline @ {horizon}a
                      </p>
                      <p className="text-2xl font-bold text-gray-300 font-[family-name:var(--font-jetbrains)] mt-1">
                        {eur(
                          activeData.baseline_totals[horizon] ?? 0
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">
                        What-if @ {horizon}a
                      </p>
                      <p
                        className="text-2xl font-bold font-[family-name:var(--font-jetbrains)] mt-1"
                        style={{ color: SCENARIO_COLORS[activeScenario] }}
                      >
                        {eur(activeData.whatif_totals[horizon] ?? 0)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Chart */}
                <Card className="bg-[#0d1117] border-gray-800">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                      Trajectoire — {activeData.label}
                    </p>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <XAxis
                            dataKey="year"
                            tick={{ fontSize: 10, fill: "#6b7280" }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(y: number) => `+${y}a`}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#6b7280" }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) =>
                              v >= 1_000_000
                                ? `${(v / 1_000_000).toFixed(1)}M`
                                : v >= 1000
                                  ? `${(v / 1000).toFixed(0)}k`
                                  : `${v}`
                            }
                            width={45}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#161b22",
                              border: "1px solid #374151",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                            labelFormatter={(y) => `+${y} ans`}
                            formatter={(v: unknown, name: unknown) => [
                              eur(Number(v)),
                              name === "baseline" ? "Baseline" : "What-if",
                            ]}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="baseline"
                            stroke="#6b7280"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                            name="baseline"
                          />
                          <Line
                            type="monotone"
                            dataKey="whatif"
                            stroke={SCENARIO_COLORS[activeScenario]}
                            strokeWidth={2}
                            dot={false}
                            name="what-if"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Tableau horizons clés */}
                <Card className="bg-[#0d1117] border-gray-800">
                  <CardContent className="pt-4 space-y-1.5">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                      Horizons clés
                    </p>
                    {activeData.key_horizons.map((h) => (
                      <div
                        key={h.years_from_now}
                        className="flex items-baseline justify-between text-xs gap-3 py-1 border-b border-gray-800/50 last:border-b-0"
                      >
                        <span className="text-gray-400 w-16">
                          +{h.years_from_now}a
                        </span>
                        <span className="text-gray-500 w-16">
                          (age {h.age})
                        </span>
                        <span className="text-gray-400 font-[family-name:var(--font-jetbrains)] flex-1 text-right">
                          {eur(h.baseline_total_eur)}
                        </span>
                        <span className="text-gray-600">→</span>
                        <span
                          className="font-[family-name:var(--font-jetbrains)] flex-1 text-right"
                          style={{ color: SCENARIO_COLORS[activeScenario] }}
                        >
                          {eur(h.whatif_total_eur)}
                        </span>
                        <span
                          className={`font-[family-name:var(--font-jetbrains)] w-24 text-right ${
                            h.delta_eur >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {h.delta_eur >= 0 ? "+" : ""}
                          {eur(h.delta_eur)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-600 pt-4 text-center">
          Les apports additionnels et boosts s&apos;ajoutent aux contributions
          déjà programmées (PEA fill, PER annuel). Les rendements proviennent
          des paramètres scenarios pondérés par tes positions.
        </p>
      </div>
    </main>
  );
}
