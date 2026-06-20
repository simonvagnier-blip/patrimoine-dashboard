"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AllocationDonut, { SCENARIO_LABELS } from "./AllocationDonut";
import PositionTable from "./PositionTable";
import ExportPDF from "./ExportPDF";
import Link from "next/link";
import type { QuotesResult } from "@/lib/quotes";
import type { ReturnsResult } from "@/lib/returns";
import { manualValueToEur } from "@/lib/currency";
import { TriBadge } from "./TriBadge";
import FillTargetWidget from "./FillTargetWidget";
import AlertsBanner from "./AlertsBanner";
import StatsBar from "./StatsBar";
import NetWorthChart from "./NetWorthChart";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  basePath?: string;
}

function computePositionValue(
  pos: Position,
  quotes: QuotesResult | null
): {
  current_price: number | null;
  current_value: number;
  pnl: number | null;
  pnl_pct: number | null;
  daily_change_pct: number | null;
} {
  if (pos.manual_value !== null) {
    const valueEur = manualValueToEur(pos.manual_value, pos.currency, {
      eurUsd: quotes?.eurUsd,
      mgaEurRate: quotes?.mgaEurRate,
    });
    return { current_price: null, current_value: valueEur, pnl: null, pnl_pct: null, daily_change_pct: null };
  }
  if (!pos.quantity || !pos.pru) {
    return { current_price: null, current_value: 0, pnl: null, pnl_pct: null, daily_change_pct: null };
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
    return {
      current_price: price,
      current_value: valueEur,
      pnl,
      pnl_pct,
      // Yahoo expose `changePercent` = variation intraday vs clôture précédente.
      // Pour le 1J de la card, on veut ça (pas la variation du snapshot stocké
      // qui peut sauter un week-end et donner une fausse impression de hausse).
      daily_change_pct: typeof quote.changePercent === "number" ? quote.changePercent : null,
    };
  }
  const fallback = pos.quantity * pos.pru;
  const fallbackEur = pos.currency === "USD" ? fallback / eurUsd : fallback;
  return { current_price: null, current_value: fallbackEur, pnl: null, pnl_pct: null, daily_change_pct: null };
}

function formatEur(v: number, decimals = 0): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: decimals });
}

interface Snapshot {
  date: string;
  total_value: number;
  invested_total?: number | null;
  /** JSON serialisé {envelope_id: value_eur} — utilisé pour calculer les
   *  deltas par enveloppe sur 1J/7J/30J. */
  details_json?: string | null;
}

interface EnvelopeDeltas {
  d1: { pct: number; perfEur: number } | null;
  d7: { pct: number; perfEur: number } | null;
  d30: { pct: number; perfEur: number } | null;
}

interface OperationRow {
  envelope_id: string;
  date: string; // YYYY-MM-DD
  type: string; // 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'dividend' | 'interest' | 'fee' | 'transfer'
  amount: number; // signé selon convention schema (cf src/lib/schema.ts)
}

/**
 * Calcule la PERFORMANCE MARCHÉ PURE pour une enveloppe sur N jours.
 *
 *   pure_perf_eur = value_now − value_then − contributions
 *   pct           = pure_perf_eur / value_then × 100
 *
 * `contributions` = somme des flux externes (achats/dépôts +, ventes/retraits −)
 * de l'enveloppe entre snapshot_then.date+1 et aujourd'hui inclus.
 *
 * Les dividendes/intérêts NE SONT PAS soustraits → comptés comme PERF (= vrai
 * retour de l'investissement). Idem pour les ajustements manuels de
 * manual_value (Cash MGA encaissant des intérêts), qui ne génèrent pas d'op
 * `buy` mais font monter la valeur de l'enveloppe → comptés comme perf aussi.
 *
 * Retourne null si pas assez d'historique pour la fenêtre demandée.
 */
function computeEnvelopeDeltas(
  envId: string,
  currentValue: number,
  sortedHistory: Snapshot[],
  operations: OperationRow[],
): EnvelopeDeltas {
  // Map opérations par enveloppe pour éviter de réitérer tout le journal à
  // chaque appel.
  const envOps = operations.filter((o) => o.envelope_id === envId);

  function compute(days: number): { pct: number; perfEur: number } | null {
    const target = Date.now() - days * 86400000;
    let snapshot: Snapshot | null = null;
    for (const s of sortedHistory) {
      if (new Date(s.date).getTime() <= target) snapshot = s;
      else break;
    }
    if (!snapshot || !snapshot.details_json) return null;

    let pastValue: number;
    try {
      const details = JSON.parse(snapshot.details_json) as Record<string, number>;
      const v = details[envId];
      if (typeof v !== "number" || v <= 0) return null;
      pastValue = v;
    } catch {
      return null;
    }

    // Somme des contributions externes entre snapshot.date (exclusif) et today (inclusif)
    let contributions = 0;
    for (const op of envOps) {
      if (op.date <= snapshot.date) continue;
      const amt = Math.abs(op.amount);
      if (op.type === "buy" || op.type === "deposit") contributions += amt;
      else if (op.type === "sell" || op.type === "withdrawal") contributions -= amt;
      // dividend / interest / fee / transfer → ignorés (comptés en perf ou neutres)
    }

    const perfEur = currentValue - pastValue - contributions;
    const pct = (perfEur / pastValue) * 100;
    return { pct, perfEur };
  }

  return {
    d1: compute(1),
    d7: compute(7),
    d30: compute(30),
  };
}

const ENVELOPE_TYPES = [
  { value: "pea", label: "PEA" },
  { value: "per", label: "PER" },
  { value: "av", label: "Assurance Vie" },
  { value: "cto", label: "CTO" },
  { value: "crypto", label: "Crypto" },
  { value: "livrets", label: "Livrets d'épargne" },
  { value: "other", label: "Autre" },
];

const ENVELOPE_COLORS = [
  "#34d399", "#a78bfa", "#f59e0b", "#f472b6", "#38bdf8", "#22d3ee",
  "#fb923c", "#a3e635", "#e879f9", "#6b7280",
];

function SortableEnvelopeCard({
  env, basePath, loading, hasQuotes, grandTotal, tri, triCashflowCount, deltas, realizedPnl = 0, hideAmounts = false,
}: {
  env: { id: string; name: string; color: string; total: number; positionCount: number; pnl: number; pnlPct: number; hasPnl: boolean };
  basePath: string;
  loading: boolean;
  hasQuotes: boolean;
  grandTotal: number;
  tri: number | null;
  triCashflowCount: number;
  deltas?: EnvelopeDeltas;
  realizedPnl?: number;
  hideAmounts?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: env.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag handle — toujours visible (opacity-30 par défaut, full au hover)
          pour rester découvrable en mobile (pas de hover) sans surcharger
          visuellement les cartes au repos. */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 z-10 touch-none cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 opacity-30 hover:opacity-100 transition-opacity p-1 rounded"
        title="Glisser pour réordonner"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2.5" cy="2" r="1.2"/><circle cx="7.5" cy="2" r="1.2"/>
          <circle cx="2.5" cy="7" r="1.2"/><circle cx="7.5" cy="7" r="1.2"/>
          <circle cx="2.5" cy="12" r="1.2"/><circle cx="7.5" cy="12" r="1.2"/>
        </svg>
      </button>
      <Link href={`${basePath}/envelope/${env.id}`}>
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
              <>
                <p className="text-xl font-bold font-[family-name:var(--font-jetbrains)] tabular-nums" style={{ color: env.color }}>
                  {hideAmounts ? "•••• €" : formatEur(env.total)}
                </p>
                {hasQuotes && env.hasPnl && (
                  <p className={`text-xs font-[family-name:var(--font-jetbrains)] tabular-nums mt-0.5 ${env.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`} title="Plus-value latente (non réalisée)">
                    <span className="text-[9px] uppercase tracking-wider text-gray-500 mr-1">Latente</span>
                    {hideAmounts ? "••••" : (
                      <>
                        {env.pnl >= 0 ? "+" : ""}{formatEur(env.pnl)}
                        <span className="text-[10px] ml-1">({env.pnl >= 0 ? "+" : ""}{env.pnlPct.toFixed(1)}%)</span>
                      </>
                    )}
                  </p>
                )}
                {/* Perf 1J/7J/30J calculée depuis les snapshots quotidiens.
                    Période avec — si pas assez d'historique pour cette enveloppe. */}
                {hasQuotes && deltas && (deltas.d1 || deltas.d7 || deltas.d30) && (
                  <div className="flex items-center gap-2 mt-1 font-[family-name:var(--font-jetbrains)] text-[10px]">
                    {(["d1", "d7", "d30"] as const).map((k) => {
                      const lbl = k === "d1" ? "1J" : k === "d7" ? "7J" : "30J";
                      const v = deltas[k];
                      if (!v) {
                        return (
                          <span key={k} className="text-gray-600">
                            <span className="text-gray-500">{lbl}</span> —
                          </span>
                        );
                      }
                      const color = v.pct >= 0 ? "text-emerald-400" : "text-red-400";
                      return (
                        <span key={k} className={color}>
                          <span className="text-gray-500">{lbl}</span>{" "}
                          {v.pct >= 0 ? "+" : ""}
                          {v.pct.toFixed(1)}%
                        </span>
                      );
                    })}
                  </div>
                )}
                {hasQuotes && realizedPnl !== 0 && (
                  <p className="text-[10px] font-[family-name:var(--font-jetbrains)] text-emerald-400/90 mt-1" title="Plus-value réalisée : gains encaissés (intérêts/dividendes), même sortis">
                    <span className="text-[9px] uppercase tracking-wider text-gray-500 mr-1">Réalisée</span>
                    {hideAmounts ? "••••" : `${realizedPnl >= 0 ? "+" : ""}${formatEur(realizedPnl)}`}
                  </p>
                )}
                {hasQuotes && triCashflowCount > 0 && (
                  <div className="mt-0.5">
                    <TriBadge tri={tri} cashflowCount={triCashflowCount} size="xs" />
                  </div>
                )}
              </>
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
    </div>
  );
}

export default function DashboardClient({ envelopes: initialEnvelopes, positions, basePath = "" }: DashboardClientProps) {
  const [envelopes, setEnvelopes] = useState(initialEnvelopes);
  const [quotes, setQuotes] = useState<QuotesResult | null>(null);
  const [returns, setReturns] = useState<ReturnsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");
  const [envelopeFilter, setEnvelopeFilter] = useState<string | null>(null);
  const [quotesError, setQuotesError] = useState(false);
  // Mode discret : masque les montants (persisté en localStorage).
  const [hideAmounts, setHideAmounts] = useState(false);
  const maskEur = (v: number) => (hideAmounts ? "•••• €" : formatEur(v));
  // F1: History
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [operations, setOperations] = useState<OperationRow[]>([]);
  // Versements cumulés PEA (depuis le profil fiscal / userParams.peaVersements).
  // Utilisé pour la barre de progression du FillTargetWidget : le plafond 150k€
  // porte sur les dépôts, pas sur la valeur. Null = non renseigné → fallback
  // cost_basis appliqué côté widget.
  const [peaDeposits, setPeaDeposits] = useState<number | null>(null);
  // Create envelope dialog
  const [createEnvOpen, setCreateEnvOpen] = useState(false);
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvType, setNewEnvType] = useState("cto");
  const [newEnvColor, setNewEnvColor] = useState(ENVELOPE_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  async function handleEnvelopeDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = envelopes.findIndex((e) => e.id === active.id);
    const newIndex = envelopes.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(envelopes, oldIndex, newIndex);
    setEnvelopes(reordered);
    const order = reordered.map((e, i) => ({ id: e.id, sort_order: i }));
    await fetch("/api/envelopes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
  }

  async function handleCreateEnvelope() {
    if (!newEnvName.trim()) return;
    setCreating(true);
    const id = newEnvName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20);
    const res = await fetch("/api/envelopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: newEnvName, type: newEnvType, color: newEnvColor }),
    });
    if (res.ok) {
      const created = await res.json();
      setEnvelopes((prev) => [...prev, created]);
      setCreateEnvOpen(false);
      setNewEnvName("");
    }
    setCreating(false);
  }

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
    fetch("/api/snapshots?days=400").then((r) => r.ok ? r.json() : []).then(setHistory).catch(() => {});
    // Opérations (achats, dépôts, retraits…) sur les 31 derniers jours,
    // nécessaires pour calculer la perf marché pure 1J/7J/30J par enveloppe
    // (soustrait les contributions des deltas de valeur).
    const fromDate = new Date(Date.now() - 31 * 86400000)
      .toISOString()
      .slice(0, 10);
    fetch(`/api/operations?from=${fromDate}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOperations(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch peaVersements (fiscal profile) pour la barre de progression PEA
  useEffect(() => {
    fetch("/api/params")
      .then((r) => (r.ok ? r.json() : null))
      .then((params: Record<string, string> | null) => {
        const raw = params?.peaVersements;
        if (raw) {
          const n = parseFloat(raw);
          if (!isNaN(n)) setPeaDeposits(n);
        }
      })
      .catch(() => {});
  }, []);

  // LOT 1b: Fetch TRI (refetch when quotes refresh — terminal value depends on
  // current market value which comes from quotes).
  useEffect(() => {
    fetch("/api/returns")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ReturnsResult | null) => { if (d) setReturns(d); })
      .catch(() => {});
  }, [quotes]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  // Mode discret : charge la préférence au montage, persiste à chaque bascule.
  useEffect(() => {
    try { setHideAmounts(localStorage.getItem("hideAmounts") === "1"); } catch {}
  }, []);
  function toggleHideAmounts() {
    setHideAmounts((v) => {
      const nv = !v;
      try { localStorage.setItem("hideAmounts", nv ? "1" : "0"); } catch {}
      return nv;
    });
  }

  const enrichedPositions = positions.map((pos) => {
    const computed = computePositionValue(pos, quotes);
    const env = envelopes.find((e) => e.id === pos.envelope_id)!;
    return { ...pos, ...computed, envelope_name: env.name, envelope_color: env.color, weight: 0 };
  });

  const grandTotal = enrichedPositions.reduce((sum, p) => sum + p.current_value, 0);

  // R1: Global P&L.
  // Capital investi = toutes les positions NON-livrets :
  //   - positions cotées : quantité × PRU (= current_value - pnl)
  //   - fonds euros / valeurs manuelles : manual_value (P&L implicite = 0)
  // Les livrets d'épargne sont exclus : ce n'est pas un investissement.
  // Cette logique est partagée avec /projections et /api/snapshots pour
  // que les chiffres soient identiques entre les deux pages.
  const livretEnvelopeIds = new Set(
    envelopes.filter((e) => e.type === "livrets").map((e) => e.id)
  );
  const totalPnl = enrichedPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const totalCostBasis = enrichedPositions.reduce((sum, p) => {
    if (livretEnvelopeIds.has(p.envelope_id)) return sum;
    if (p.pnl !== null) return sum + (p.current_value - p.pnl);
    // Pour manual_value, current_value est déjà converti via computePositionValue
    // (utilise manualValueToEur qui gère MGA/USD/EUR). On l'utilise donc plutôt
    // que p.manual_value brut qui peut être dans une devise étrangère.
    if (p.manual_value !== null) return sum + p.current_value;
    return sum + p.current_value;
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
    // Capital investi : même logique que le header (livrets exclus, fonds
    // euros inclus à leur manual_value).
    const investedTotal = totalCostBasis;
    fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_value: grandTotal, invested_total: investedTotal, details }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasQuotes]);

  // Pré-trie l'historique pour le calcul des deltas par enveloppe (réutilisé
  // pour chaque enveloppe au lieu d'un sort par appel).
  const sortedHistoryAsc = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const envelopeData = envelopes.map((env) => {
    const envPositions = enrichedPositions.filter((p) => p.envelope_id === env.id);
    const total = envPositions.reduce((sum, p) => sum + p.current_value, 0);
    const envPnl = envPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
    const envCostBasis = envPositions.reduce((sum, p) => {
      if (p.pnl !== null) return sum + (p.current_value - p.pnl);
      return sum;
    }, 0);
    const envPnlPct = envCostBasis > 0 ? (envPnl / envCostBasis) * 100 : 0;
    const envHasPnl = envPositions.some((p) => p.pnl !== null);
    // Versements cumulés PEA : priorité au param manuel (peaDeposits),
    // fallback cost_basis (bonne approx en l'absence de divs réinvestis).
    const depositsForEnv =
      env.type === "pea"
        ? (peaDeposits ?? (envHasPnl ? envCostBasis : null))
        : null;
    // Deltas 1J/7J/30J : performance marché pure (= delta valeur − contributions
    // externes dans la fenêtre). Les achats/dépôts sont soustraits → le delta
    // reflète UNIQUEMENT le mouvement de marché (cf computeEnvelopeDeltas).
    // Pour les enveloppes purement cash (livrets) le tracking des cashflows
    // n'est pas fiable (l'utilisateur édite manual_value sans logger d'op) →
    // on n'affiche pas de perf pour éviter d'induire en erreur.
    const envDeltas: EnvelopeDeltas =
      env.type === "livrets"
        ? { d1: null, d7: null, d30: null }
        : computeEnvelopeDeltas(env.id, total, sortedHistoryAsc, operations);
    return {
      ...env,
      total,
      positionCount: envPositions.length,
      pnl: envPnl,
      pnlPct: envPnlPct,
      hasPnl: envHasPnl,
      deposits: depositsForEnv,
      deltas: envDeltas,
    };
  });

  // Deltas globaux (StatsBar) : on AGRÈGE les perfs marché pures des enveloppes.
  //   - perf_total_eur = somme des perfEur de chaque enveloppe (uniquement
  //     celles qui ont un delta calculable pour la période)
  //   - pct = perf_total_eur / somme(valueThen des enveloppes participantes) × 100
  // Approche cohérente avec les cards : si on ajoute Madagascar aujourd'hui,
  // ça contribue 0 à la perf 1J (pas dans la fenêtre) → ne fausse pas le total.
  function aggregateDeltas(key: "d1" | "d7" | "d30"): { perfEur: number; pct: number } | null {
    let perfSum = 0;
    let basisSum = 0;
    let anyHit = false;
    for (const e of envelopeData) {
      const d = e.deltas[key];
      if (!d) continue;
      // Pour calculer le % il nous faut la valeur "then" de cette enveloppe.
      // On la recalcule : valueThen = e.total - d.perfEur - contributions_in_window.
      // Mais on a déjà perfEur = (now - then - contribs), donc
      // then = now - perfEur - contribs. On n'a pas contribs ici à la main.
      // Alternative : utiliser d.perfEur / (d.pct / 100) = valueThen.
      if (d.pct === 0) {
        // perfEur = 0 → on peut juste ignorer pour le %
        continue;
      }
      const valueThen = d.perfEur / (d.pct / 100);
      perfSum += d.perfEur;
      basisSum += valueThen;
      anyHit = true;
    }
    if (!anyHit || basisSum <= 0) return null;
    return { perfEur: perfSum, pct: (perfSum / basisSum) * 100 };
  }

  const globalDeltas = {
    d1: aggregateDeltas("d1"),
    d7: aggregateDeltas("d7"),
    d30: aggregateDeltas("d30"),
  };

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
        {/* Header — un seul héros (le total) à gauche, actions à droite */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
          {/* Zone données */}
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Patrimoine · Vue consolidée</p>
            {loading && !hasQuotes ? (
              <div className="h-10 w-52 bg-gray-800 rounded animate-pulse mt-2" />
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <p className="text-3xl sm:text-4xl font-bold text-white font-[family-name:var(--font-jetbrains)] tabular-nums leading-none">
                  {hideAmounts ? "•• ••• €" : formatEur(grandTotal)}
                </p>
                <button
                  onClick={toggleHideAmounts}
                  aria-label={hideAmounts ? "Afficher les montants" : "Masquer les montants"}
                  title={hideAmounts ? "Afficher les montants" : "Masquer les montants"}
                  className="text-gray-600 hover:text-gray-300 transition-colors p-1 shrink-0"
                >
                  {hideAmounts ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            )}
            {hasQuotes && (
              <>
                {/* Plus-value LATENTE (non réalisée) — signe par chevron + couleur */}
                <p
                  className={`text-base font-[family-name:var(--font-jetbrains)] tabular-nums mt-2 ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                  title="Plus-value latente (non réalisée) sur tes positions cotées — hors livrets"
                >
                  {totalPnl >= 0 ? "▲" : "▼"}{" "}
                  {hideAmounts ? "••••" : (
                    <>
                      {totalPnl >= 0 ? "+" : ""}{formatEur(totalPnl)}
                      <span className="text-sm ml-1 opacity-80">({totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)</span>
                    </>
                  )}
                </p>
                {/* Ligne secondaire : Investi · Réalisée · TRI */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-[family-name:var(--font-jetbrains)] tabular-nums text-gray-500 mt-1.5">
                  {totalCostBasis > 0 && (
                    <span>Investi <span className="text-gray-400">{maskEur(totalCostBasis)}</span></span>
                  )}
                  {returns && returns.global.realized_pnl_eur !== 0 && (
                    <>
                      <span className="text-gray-700">·</span>
                      <span title="Plus-value réalisée : gains encaissés (intérêts/dividendes), même sortis du patrimoine">
                        Réalisée <span className="text-emerald-400">{hideAmounts ? "••••" : `${returns.global.realized_pnl_eur >= 0 ? "+" : ""}${formatEur(returns.global.realized_pnl_eur)}`}</span>
                      </span>
                    </>
                  )}
                  {returns && (
                    <>
                      <span className="text-gray-700">·</span>
                      <TriBadge tri={returns.global.tri_annual} cashflowCount={returns.global.cashflow_count} coverage={returns.global.coverage} />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          {/* Zone actions — 1 action primaire + secondaires discrets */}
          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button
                size="sm"
                onClick={() => fetchQuotes(true)}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
              >
                {loading ? "Chargement..." : "Actualiser"}
              </Button>
              <div className="flex flex-wrap gap-0.5">
                <Link href={`${basePath}/projections`}>
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-[#161b22]">Projections</Button>
                </Link>
                <Link href={`${basePath}/what-if`}>
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-[#161b22]">What-if</Button>
                </Link>
                <Link href={`${basePath}/fiscal`}>
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-[#161b22]">Fiscal</Button>
                </Link>
                <ExportPDF grandTotal={grandTotal} envelopeData={envelopeData} positions={enrichedPositions} />
              </div>
            </div>
            {lastUpdate && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-gray-500">MAJ {lastUpdate}</span>
              </div>
            )}
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

        {/* LOT 2: Alerts banner */}
        <AlertsBanner />

        {/* Pièce maîtresse : grande courbe d'évolution du patrimoine */}
        {hasQuotes && history.length > 1 && <NetWorthChart history={history} hideAmounts={hideAmounts} />}

        {/* Barre de KPIs (dividendes / épargne / deltas) — sparkline retirée */}
        {hasQuotes && (
          <StatsBar
            grandTotal={grandTotal}
            globalDeltas={globalDeltas}
            basePath={basePath}
          />
        )}

        {/* LOT 2: Fill-to-target widgets (PEA, etc.) */}
        {hasQuotes && (
          <FillTargetWidget
            envelopes={envelopeData.map((e) => ({
              id: e.id,
              name: e.name,
              color: e.color,
              type: e.type,
              target: e.target,
              fill_end_year: e.fill_end_year,
              total: e.total,
              deposits: e.deposits,
            }))}
            basePath={basePath}
          />
        )}

        {/* Envelope Cards — sortable */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnvelopeDragEnd}>
          <SortableContext items={envelopeData.map((e) => e.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {envelopeData.map((env) => (
                <SortableEnvelopeCard
                  key={env.id}
                  env={env}
                  basePath={basePath}
                  loading={loading}
                  hasQuotes={hasQuotes}
                  grandTotal={grandTotal}
                  tri={returns?.envelopes.find((r) => r.envelope_id === env.id)?.tri_annual ?? null}
                  triCashflowCount={returns?.envelopes.find((r) => r.envelope_id === env.id)?.cashflow_count ?? 0}
                  deltas={env.deltas}
                  realizedPnl={returns?.envelopes.find((r) => r.envelope_id === env.id)?.realized_pnl_eur ?? 0}
                  hideAmounts={hideAmounts}
                />
              ))}
              {/* Add envelope button */}
              <button
                onClick={() => setCreateEnvOpen(true)}
                className="border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-xl flex flex-col items-center justify-center gap-2 py-8 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer min-h-[140px]"
              >
                <span className="text-2xl">+</span>
                <span className="text-xs">Ajouter une enveloppe</span>
              </button>
            </div>
          </SortableContext>
        </DndContext>

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

      {/* Create Envelope Dialog */}
      <Dialog open={createEnvOpen} onOpenChange={setCreateEnvOpen}>
        <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouvelle enveloppe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Nom</Label>
              <Input
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                placeholder="Ex: Binance, PEA Boursorama..."
                className="bg-[#161b22] border-gray-700 text-white"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Type</Label>
              <select
                value={newEnvType}
                onChange={(e) => setNewEnvType(e.target.value)}
                className="w-full bg-[#161b22] border border-gray-700 text-white rounded-md px-3 py-2 text-sm"
              >
                {ENVELOPE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Couleur</Label>
              <div className="flex gap-2 flex-wrap">
                {ENVELOPE_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewEnvColor(color)}
                    className={`w-7 h-7 rounded-full transition-all ${newEnvColor === color ? "ring-2 ring-white ring-offset-2 ring-offset-[#0d1117] scale-110" : "hover:scale-110"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setCreateEnvOpen(false)} className="border-gray-700 text-gray-300 hover:bg-[#161b22]">
                Annuler
              </Button>
              <Button onClick={handleCreateEnvelope} disabled={creating || !newEnvName.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {creating ? "..." : "Créer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
