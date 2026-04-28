"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import ProjectionChart, { type HistoryPoint } from "@/components/ProjectionChart";
import {
  runSimulation,
  computeWeightedReturn,
  type SimulationInput,
} from "@/lib/simulation";
import type { QuotesResult } from "@/lib/quotes";
import Link from "next/link";

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
  quantity: number | null;
  pru: number | null;
  manual_value: number | null;
  scenario_key: string;
  currency: string;
}

interface ScenarioParam {
  id: number;
  scenario: string;
  asset_class: string;
  annual_return: number;
}

const ASSET_LABELS: Record<string, string> = {
  sp: "S&P 500",
  wd: "MSCI World",
  em: "Emerging Markets",
  nq: "Nasdaq-100",
  tech: "Tech/Growth",
  energy: "Énergie",
  fg: "Fonds garanti",
  fe: "Fonds euros",
  cash: "Cash",
};

const SCENARIO_LABELS: Record<string, string> = {
  p: "Pessimiste",
  m: "Modéré",
  o: "Optimiste",
};

const SCENARIO_COLORS: Record<string, string> = {
  p: "#f87171",
  m: "#fbbf24",
  o: "#34d399",
};

const HORIZONS = [5, 10, 15, 20, 25, 30, 35];

function formatEur(v: number): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

export default function ProjectionsClient({
  envelopes,
  positions,
  scenarioParams: initialScenarioParams,
  userParams: initialUserParams,
}: {
  envelopes: Envelope[];
  positions: Position[];
  scenarioParams: ScenarioParam[];
  userParams: Record<string, string>;
}) {
  const [currentAge, setCurrentAge] = useState(
    parseInt(initialUserParams.currentAge || "32")
  );
  const [retireAge, setRetireAge] = useState(
    parseInt(initialUserParams.retireAge || "64")
  );
  const [perContrib, setPerContrib] = useState(
    envelopes.find((e) => e.id === "per")?.annual_contrib ?? 10000
  );
  const [scenarioParams, setScenarioParams] = useState(initialScenarioParams);
  const [quotes, setQuotes] = useState<QuotesResult | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/quotes");
      if (res.ok) setQuotes(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchQuotes();
    fetch("/api/snapshots?days=3650")
      .then((r) => r.ok ? r.json() : [])
      .then((data: HistoryPoint[]) => setHistory(data))
      .catch(() => {});
  }, [fetchQuotes]);

  // Compute current value per position
  function posValue(pos: Position): number {
    if (pos.manual_value !== null) return pos.manual_value;
    if (!pos.quantity || !pos.pru) return 0;
    const eurUsd = quotes?.eurUsd ?? 1.08;
    const quote = pos.yahoo_ticker && quotes?.quotes[pos.yahoo_ticker];
    if (quote) {
      const raw = pos.quantity * quote.price;
      return pos.currency === "USD" ? raw / eurUsd : raw;
    }
    const fallback = pos.quantity * pos.pru;
    return pos.currency === "USD" ? fallback / eurUsd : fallback;
  }

  // Cost basis EUR (fallback pour versements PEA quand peaVersements absent).
  function posCostBasis(pos: Position): number {
    if (!pos.quantity || !pos.pru) return 0;
    const eurUsd = quotes?.eurUsd ?? 1.08;
    const raw = pos.quantity * pos.pru;
    return pos.currency === "USD" ? raw / eurUsd : raw;
  }

  // Build simulation input
  const simInput = useMemo<SimulationInput>(() => {
    const maxHorizon = Math.max(...HORIZONS);

    const envInputs = envelopes.map((env) => {
      const envPositions = positions.filter((p) => p.envelope_id === env.id);
      const positionsWithValue = envPositions.map((p) => ({
        scenario_key: p.scenario_key,
        value: posValue(p),
      }));
      const currentValue = positionsWithValue.reduce(
        (sum, p) => sum + p.value,
        0
      );
      const returns = computeWeightedReturn(
        positionsWithValue,
        scenarioParams,
        currentValue
      );

      // PEA : priorité peaVersements saisi > somme cost_basis > currentValue (fallback sim.ts)
      const peaVersementsRaw = initialUserParams.peaVersements;
      const peaVersementsCumules = peaVersementsRaw
        ? parseFloat(peaVersementsRaw)
        : null;
      const peaFallbackFromCostBasis =
        env.type === "pea"
          ? envPositions.reduce((sum, p) => sum + posCostBasis(p), 0)
          : 0;
      const versementsCumulesEur =
        env.type === "pea"
          ? (peaVersementsCumules ?? (peaFallbackFromCostBasis > 0 ? peaFallbackFromCostBasis : undefined))
          : undefined;
      // Capital investi initial : cost_basis + manual_value, livrets exclus.
      const initialInvestedEur =
        env.type === "livrets"
          ? 0
          : envPositions.reduce((sum, p) => {
              if (p.manual_value !== null) return sum + p.manual_value;
              return sum + posCostBasis(p);
            }, 0);
      return {
        id: env.id,
        name: env.name,
        color: env.color,
        currentValue,
        type: env.type,
        target: env.target,
        fill_end_year: env.fill_end_year,
        annual_contrib: env.id === "per" ? perContrib : env.annual_contrib,
        returns,
        versements_cumules_eur: versementsCumulesEur,
        initial_invested_eur: initialInvestedEur,
      };
    });

    return {
      envelopes: envInputs,
      currentAge,
      retireAge,
      horizonYears: maxHorizon,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopes, positions, scenarioParams, currentAge, retireAge, perContrib, quotes]);

  const results = useMemo(() => runSimulation(simInput), [simInput]);

  // Compute current invested capital and plus-value
  const { totalValue, investedCapital, plusValue, plusValuePct } = useMemo(() => {
    const eurUsd = quotes?.eurUsd ?? 1.08;
    let total = 0;
    let invested = 0;
    for (const pos of positions) {
      if (pos.manual_value !== null) {
        total += pos.manual_value;
        invested += pos.manual_value;
        continue;
      }
      if (!pos.quantity || !pos.pru) continue;
      const quote = pos.yahoo_ticker && quotes?.quotes[pos.yahoo_ticker];
      let currentVal: number;
      if (quote) {
        const raw = pos.quantity * quote.price;
        currentVal = pos.currency === "USD" ? raw / eurUsd : raw;
      } else {
        const raw = pos.quantity * pos.pru;
        currentVal = pos.currency === "USD" ? raw / eurUsd : raw;
      }
      const costBasis = pos.currency === "USD"
        ? (pos.quantity * pos.pru) / eurUsd
        : pos.quantity * pos.pru;
      total += currentVal;
      invested += costBasis;
    }
    const pv = total - invested;
    const pvPct = invested > 0 ? (pv / invested) * 100 : 0;
    return { totalValue: total, investedCapital: invested, plusValue: pv, plusValuePct: pvPct };
  }, [positions, quotes]);

  // R11: Auto-save params with debounce
  const autoSave = useCallback(async () => {
    await Promise.all([
      fetch("/api/params", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentAge: currentAge.toString(), retireAge: retireAge.toString() }),
      }),
      fetch("/api/envelopes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "per", annual_contrib: perContrib }),
      }),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [currentAge, retireAge, perContrib]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { autoSave(); }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [currentAge, retireAge, perContrib, autoSave]);

  // Save a single scenario param
  async function updateScenarioParam(
    scenario: string,
    asset_class: string,
    annual_return: number
  ) {
    setScenarioParams((prev) =>
      prev.map((sp) =>
        sp.scenario === scenario && sp.asset_class === asset_class
          ? { ...sp, annual_return }
          : sp
      )
    );
    await fetch("/api/scenarios", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario, asset_class, annual_return }),
    });
  }

  // Get unique asset classes from scenario params
  const assetClasses = [
    ...new Set(scenarioParams.map((sp) => sp.asset_class)),
  ];

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="border-gray-700 text-gray-400 hover:bg-[#161b22] hover:text-white"
              >
                &larr; Retour
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-white">Projections</h1>
          </div>
        </div>

        {/* Params */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-6">
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Âge actuel</Label>
                <Input
                  type="number"
                  value={currentAge}
                  onChange={(e) => setCurrentAge(parseInt(e.target.value) || 32)}
                  className="w-20 bg-[#161b22] border-gray-700 text-white font-[family-name:var(--font-jetbrains)] text-center"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Retraite</Label>
                <Input
                  type="number"
                  value={retireAge}
                  onChange={(e) => setRetireAge(parseInt(e.target.value) || 64)}
                  className="w-20 bg-[#161b22] border-gray-700 text-white font-[family-name:var(--font-jetbrains)] text-center"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">
                  Versement PER/an
                </Label>
                <Input
                  type="number"
                  value={perContrib}
                  onChange={(e) =>
                    setPerContrib(parseInt(e.target.value) || 10000)
                  }
                  className="w-32 bg-[#161b22] border-gray-700 text-white font-[family-name:var(--font-jetbrains)] text-center"
                />
              </div>
              {saved && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Sauvegardé
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Current Summary: Invested vs Plus-Value */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-gray-400 mb-1">Patrimoine total</p>
              <p className="text-xl font-bold text-white font-[family-name:var(--font-jetbrains)]">
                {formatEur(totalValue)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-gray-400 mb-1">Capital investi</p>
              <p className="text-xl font-bold text-gray-300 font-[family-name:var(--font-jetbrains)]">
                {formatEur(investedCapital)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-gray-400 mb-1">Plus-value</p>
              <p className={`text-xl font-bold font-[family-name:var(--font-jetbrains)] ${plusValue >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {plusValue >= 0 ? "+" : ""}{formatEur(plusValue)}
              </p>
              <p className={`text-xs mt-0.5 ${plusValue >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                {plusValue >= 0 ? "+" : ""}{plusValuePct.toFixed(1)} %
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              Projection du patrimoine
            </CardTitle>
            <div className="flex gap-4 text-xs mt-2">
              {(["o", "m", "p"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-0.5 rounded"
                    style={{ backgroundColor: SCENARIO_COLORS[s] }}
                  />
                  <span className="text-gray-400">{SCENARIO_LABELS[s]}</span>
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded bg-white" />
                <span className="text-gray-400">Historique réel</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded border-b border-dashed border-gray-500" />
                <span className="text-gray-400">Capital investi</span>
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ProjectionChart
              results={results}
              horizonYears={Math.max(...HORIZONS)}
              currentAge={currentAge}
              retireAge={retireAge}
              history={history}
            />
          </CardContent>
        </Card>

        {/* Horizons Table */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              Tableau des horizons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400">Horizon</TableHead>
                    <TableHead className="text-gray-400 text-right">
                      Investi
                    </TableHead>
                    {(["p", "m", "o"] as const).map((s) => (
                      <TableHead
                        key={s}
                        className="text-right"
                        style={{ color: SCENARIO_COLORS[s] }}
                      >
                        {SCENARIO_LABELS[s]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {HORIZONS.map((h) => {
                    if (h > Math.max(...HORIZONS)) return null;
                    return (
                      <TableRow key={h} className="border-gray-800 hover:bg-[#161b22]">
                        <TableCell className="text-gray-300 font-medium">
                          {h} ans
                          <span className="text-gray-500 text-xs ml-1">
                            ({currentAge + h} ans)
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-gray-400 text-sm">
                          {results[0] ? formatEur(results[0].invested[h]) : "—"}
                        </TableCell>
                        {(["p", "m", "o"] as const).map((s) => {
                          const r = results.find((r) => r.scenario === s);
                          return (
                            <TableCell
                              key={s}
                              className="text-right font-[family-name:var(--font-jetbrains)] text-sm font-medium"
                              style={{ color: SCENARIO_COLORS[s] }}
                            >
                              {r ? formatEur(r.totals[h]) : "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Sub-detail per envelope for moderate scenario */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-400 mb-3">
                Détail par enveloppe (scénario modéré)
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">
                        Enveloppe
                      </TableHead>
                      {HORIZONS.map((h) => (
                        <TableHead
                          key={h}
                          className="text-gray-400 text-right text-xs"
                        >
                          {h} ans
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results
                      .find((r) => r.scenario === "m")
                      ?.envelopes.map((envProj) => (
                        <TableRow
                          key={envProj.id}
                          className="border-gray-800 hover:bg-[#161b22]"
                        >
                          <TableCell>
                            <span className="flex items-center gap-2 text-sm">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: envProj.color }}
                              />
                              <span className="text-gray-300">
                                {envProj.name}
                              </span>
                            </span>
                          </TableCell>
                          {HORIZONS.map((h) => (
                            <TableCell
                              key={h}
                              className="text-right font-[family-name:var(--font-jetbrains)] text-gray-300 text-xs"
                            >
                              {formatEur(envProj.values[h])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Yield Assumptions */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              Hypothèses de rendement (% annuel)
            </CardTitle>
          </CardHeader>
          <Separator className="bg-gray-800" />
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400">
                      Classe d&apos;actifs
                    </TableHead>
                    {(["p", "m", "o"] as const).map((s) => (
                      <TableHead
                        key={s}
                        className="text-center"
                        style={{ color: SCENARIO_COLORS[s] }}
                      >
                        {SCENARIO_LABELS[s]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetClasses.map((ac) => (
                    <TableRow
                      key={ac}
                      className="border-gray-800 hover:bg-[#161b22]"
                    >
                      <TableCell className="text-gray-300 text-sm">
                        {ASSET_LABELS[ac] || ac}
                      </TableCell>
                      {(["p", "m", "o"] as const).map((s) => {
                        const param = scenarioParams.find(
                          (sp) =>
                            sp.scenario === s && sp.asset_class === ac
                        );
                        return (
                          <TableCell key={s} className="text-center">
                            <Input
                              type="number"
                              step="0.1"
                              value={param?.annual_return ?? 0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  updateScenarioParam(s, ac, val);
                                }
                              }}
                              className="w-20 mx-auto bg-[#161b22] border-gray-700 text-white font-[family-name:var(--font-jetbrains)] text-center text-sm h-8"
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
