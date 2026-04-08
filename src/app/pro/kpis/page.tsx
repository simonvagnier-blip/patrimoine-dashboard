"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

interface KPI {
  id: number;
  metric: string;
  value: number;
  target: number | null;
  period: string;
}

interface Deal {
  id: number;
  value: number | null;
  stage: string;
  probability: number;
  created_at: string;
  updated_at: string;
}

const AUTO_METRICS = ["CA", "proposals", "conversion"];

const DEFAULT_KPIS = [
  { metric: "CA", label: "Chiffre d'affaires", color: "#34d399", unit: "\u20ac", auto: true },
  { metric: "meetings", label: "RDV clients", color: "#3b82f6", unit: "", auto: false },
  { metric: "calls", label: "Appels", color: "#f59e0b", unit: "", auto: false },
  { metric: "proposals", label: "Propositions envoy\u00e9es", color: "#a78bfa", unit: "", auto: true },
  { metric: "conversion", label: "Taux de conversion", color: "#38bdf8", unit: "%", auto: true },
];

function formatValue(v: number, unit: string): string {
  if (unit === "\u20ac") return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  if (unit === "%") return v.toFixed(1) + "%";
  return v.toString();
}

function dealsInPeriod(deals: Deal[], period: string): Deal[] {
  // period is YYYY-MM, match deals whose updated_at falls in that month
  return deals.filter((d) => d.updated_at && d.updated_at.slice(0, 7) === period);
}

export default function KPIsPage() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editTarget, setEditTarget] = useState("");

  const fetchKpis = useCallback(async () => {
    const res = await fetch(`/api/kpis?period=${period}`);
    if (res.ok) setKpis(await res.json());
  }, [period]);

  const fetchDeals = useCallback(async () => {
    const res = await fetch("/api/deals");
    if (res.ok) setDeals(await res.json());
  }, []);

  useEffect(() => { fetchKpis(); fetchDeals(); }, [fetchKpis, fetchDeals]);

  // Calculate auto KPIs from deals
  const periodDeals = dealsInPeriod(deals, period);
  const wonDeals = periodDeals.filter((d) => d.stage === "won");
  const lostDeals = periodDeals.filter((d) => d.stage === "lost");
  const proposalPlusDeals = periodDeals.filter((d) => ["proposal", "negotiation", "won", "lost"].includes(d.stage));

  const autoCA = wonDeals.reduce((s, d) => s + (d.value ?? 0), 0);
  const autoProposals = proposalPlusDeals.length;
  const autoConversion = (wonDeals.length + lostDeals.length) > 0
    ? (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100
    : 0;

  function getAutoValue(metric: string): number {
    if (metric === "CA") return autoCA;
    if (metric === "proposals") return autoProposals;
    if (metric === "conversion") return autoConversion;
    return 0;
  }

  async function saveKpi(metric: string) {
    await fetch("/api/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric,
        value: parseFloat(editValue) || 0,
        target: editTarget ? parseFloat(editTarget) : null,
        period,
      }),
    });
    setEditing(null);
    fetchKpis();
  }

  function getKpi(metric: string): KPI | undefined {
    return kpis.find((k) => k.metric === metric);
  }

  const periodLabel = new Date(period + "-15").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <main className="min-h-screen bg-[#0a0f1e] p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">KPIs</h1>
            <p className="text-gray-400 text-sm mt-1">{periodLabel}</p>
          </div>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="bg-[#0d1220] border-gray-700 text-white text-sm w-40" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DEFAULT_KPIS.map((def) => {
            const kpi = getKpi(def.metric);
            const isAuto = def.auto;
            const value = isAuto ? getAutoValue(def.metric) : (kpi?.value ?? 0);
            const target = kpi?.target;
            const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
            const isEditing = editing === def.metric;

            return (
              <Card key={def.metric} className="bg-[#0d1220] border-gray-800">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-400">{def.label}</p>
                      {isAuto && (
                        <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">Auto</span>
                      )}
                    </div>
                    {/* Only allow editing for manual KPIs, or editing target for auto KPIs */}
                    {!isAuto && (
                      <button onClick={() => {
                        if (isEditing) { saveKpi(def.metric); } else {
                          setEditing(def.metric);
                          setEditValue(value.toString());
                          setEditTarget(target?.toString() || "");
                        }
                      }} className="text-xs text-gray-500 hover:text-white">
                        {isEditing ? "Sauver" : "Modifier"}
                      </button>
                    )}
                    {isAuto && (
                      <button onClick={() => {
                        if (isEditing) { saveKpi(def.metric); } else {
                          setEditing(def.metric);
                          setEditValue(value.toString());
                          setEditTarget(target?.toString() || "");
                        }
                      }} className="text-xs text-gray-500 hover:text-white">
                        {isEditing ? "Sauver" : "Objectif"}
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-2">
                      {!isAuto && (
                        <div>
                          <label className="text-[10px] text-gray-500">Valeur</label>
                          <Input type="number" step="any" value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveKpi(def.metric)}
                            className="bg-[#161b22] border-gray-700 text-white h-8 text-sm" autoFocus />
                        </div>
                      )}
                      <div className={isAuto ? "col-span-2" : ""}>
                        <label className="text-[10px] text-gray-500">Objectif</label>
                        <Input type="number" step="any" value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveKpi(def.metric)}
                          className="bg-[#161b22] border-gray-700 text-white h-8 text-sm" autoFocus={isAuto} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold font-[family-name:var(--font-jetbrains)]" style={{ color: def.color }}>
                          {formatValue(value, def.unit)}
                        </span>
                        {target != null && (
                          <span className="text-xs text-gray-500">/ {formatValue(target, def.unit)}</span>
                        )}
                      </div>
                      {target != null && (
                        <div className="space-y-1">
                          <Progress value={pct} className="h-1.5 bg-gray-800" />
                          <p className="text-[10px] text-gray-500 text-right">{pct.toFixed(0)}%</p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
