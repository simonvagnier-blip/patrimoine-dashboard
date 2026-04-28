"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PositionDialog from "@/components/PositionDialog";
import SparklineChart from "@/components/SparklineChart";
import PositionChartPanel from "@/components/PositionChart";
import EnvelopeChartPanel from "@/components/EnvelopeChart";
import OperationsTimeline from "@/components/OperationsTimeline";
import { TriBadge } from "@/components/TriBadge";
import type { ReturnsResult } from "@/lib/returns";
import PositionAlerts from "@/components/PositionAlerts";
import PositionDividends from "@/components/PositionDividends";
import KebabMenu from "@/components/KebabMenu";
import Link from "next/link";
import type { QuotesResult } from "@/lib/quotes";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Envelope {
  id: string; name: string; type: string; color: string;
  target: number | null; fill_end_year: number | null; annual_contrib: number | null;
}

interface Position {
  id: number; envelope_id: string; ticker: string; yahoo_ticker: string | null;
  label: string; isin: string | null; quantity: number | null; pru: number | null;
  manual_value: number | null; scenario_key: string; currency: string;
}

function formatEur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: d });
}

interface EnrichedPosition extends Position {
  price: number | null;
  value: number;
  pnl: number | null;
  pnlPct: number | null;
}

function SortablePositionCard({
  pos, isExpanded, onToggle, quotes, totalValue, pnlColor, onBuy, onEdit, onDelete, triRow, triggeredCount, onAlertsChanged,
}: {
  pos: EnrichedPosition;
  isExpanded: boolean;
  onToggle: () => void;
  quotes: QuotesResult | null;
  totalValue: number;
  pnlColor: (pnl: number | null) => string;
  onBuy: (p: Position) => void;
  onEdit: (p: Position) => void;
  onDelete: (p: Position) => void;
  triRow: { tri_annual: number | null; cashflow_count: number; coverage: "full" | "partial" | "none" } | null;
  triggeredCount: number;
  onAlertsChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pos.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const sym = pos.currency === "USD" ? "$" : "€";
  const costBasis = pos.quantity && pos.pru ? pos.quantity * pos.pru : null;
  const costBasisEur = costBasis !== null && pos.currency === "USD" ? costBasis / (quotes?.eurUsd ?? 1.08) : costBasis;
  const variationPct = pos.price !== null && pos.pru ? ((pos.price - pos.pru) / pos.pru) * 100 : null;

  return (
    <div ref={setNodeRef} style={style} className={`bg-[#161b22] rounded-lg overflow-hidden transition-all duration-200 ${isExpanded ? "ring-1 ring-gray-700" : "hover:ring-1 hover:ring-gray-800"}`}>
      {/* Main row */}
      <div className="p-3 sm:p-4 cursor-pointer hover:bg-[#1c2333] transition-colors flex items-center gap-2" onClick={onToggle}>
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-200 opacity-50 hover:opacity-100 shrink-0 p-1 -ml-1 transition-opacity"
          onClick={(e) => e.stopPropagation()}
          title="Glisser pour réordonner"
        >
          <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
            <circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/>
            <circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/>
            <circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/>
          </svg>
        </button>
        <div className="flex items-center justify-between gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-[family-name:var(--font-jetbrains)] text-sm font-bold text-white shrink-0">{pos.ticker}</span>
            {triggeredCount > 0 && (
              <span
                className="text-amber-400 text-xs flex items-center gap-0.5 shrink-0"
                title={`${triggeredCount} alerte${triggeredCount > 1 ? "s" : ""} déclenchée${triggeredCount > 1 ? "s" : ""}`}
              >
                🔔
                {triggeredCount > 1 && <span className="text-[10px]">{triggeredCount}</span>}
              </span>
            )}
            <span className="text-sm text-gray-400 truncate hidden sm:inline">{pos.label}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {pos.yahoo_ticker && (
              <span className="hidden sm:block">
                <SparklineChart ticker={pos.yahoo_ticker} />
              </span>
            )}
            <div className="text-right">
              <span className="font-[family-name:var(--font-jetbrains)] text-sm font-bold text-white">
                {formatEur(pos.value)}
              </span>
              {pos.pnl !== null ? (
                <p className={`font-[family-name:var(--font-jetbrains)] text-xs ${pnlColor(pos.pnl)}`}>
                  {pos.pnl >= 0 ? "+" : ""}{formatEur(pos.pnl)} ({pos.pnlPct !== null ? (pos.pnlPct >= 0 ? "+" : "") + pos.pnlPct.toFixed(1) + "%" : ""})
                </p>
              ) : pos.manual_value === null ? (
                <p className="text-[10px] text-gray-600">P&amp;L en attente</p>
              ) : null}
              {triRow && triRow.cashflow_count > 0 && (
                <div className="mt-0.5">
                  <TriBadge tri={triRow.tri_annual} cashflowCount={triRow.cashflow_count} coverage={triRow.coverage} size="xs" />
                </div>
              )}
            </div>
            {/* Kebab menu : actions rapides sans avoir à déplier le panneau */}
            <KebabMenu
              items={[
                ...(pos.quantity !== null
                  ? [{ label: "Achat", icon: "+", onClick: () => onBuy(pos) }]
                  : []),
                { label: "Modifier", icon: "✎", onClick: () => onEdit(pos) },
                {
                  label: "Supprimer",
                  icon: "✕",
                  onClick: () => onDelete(pos),
                  destructive: true,
                },
              ]}
            />
            <span className={`text-gray-500 text-xs transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>&#9660;</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500 truncate px-4 -mt-2 pb-2 sm:hidden">{pos.label}</p>

      {/* Expanded detail panel */}
      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-gray-800 bg-[#0d1117]">
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {pos.quantity !== null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Quantité</p>
                  <p className="font-[family-name:var(--font-jetbrains)] text-sm text-white">
                    {pos.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}
                  </p>
                </div>
              )}
              {pos.pru !== null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Prix de revient (PRU)</p>
                  <p className="font-[family-name:var(--font-jetbrains)] text-sm text-white">
                    {pos.pru.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {sym}
                  </p>
                </div>
              )}
              {pos.price !== null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Cours actuel</p>
                  <p className="font-[family-name:var(--font-jetbrains)] text-sm text-white">
                    {pos.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}
                  </p>
                </div>
              )}
              {variationPct !== null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Variation / PRU</p>
                  <p className={`font-[family-name:var(--font-jetbrains)] text-sm font-medium ${variationPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {variationPct >= 0 ? "+" : ""}{variationPct.toFixed(2)}%
                  </p>
                </div>
              )}
              {costBasisEur !== null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Coût d&apos;acquisition</p>
                  <p className="font-[family-name:var(--font-jetbrains)] text-sm text-gray-300">{formatEur(costBasisEur)}</p>
                </div>
              )}
              <div className={`${pos.pnl !== null ? "col-span-2" : ""}`}>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">P&amp;L (B&eacute;n&eacute;fice / Perte)</p>
                {pos.pnl !== null ? (
                  <div className="flex items-baseline gap-3">
                    <p className={`font-[family-name:var(--font-jetbrains)] text-lg font-bold ${pnlColor(pos.pnl)}`}>
                      {pos.pnl >= 0 ? "+" : ""}{formatEur(pos.pnl)}
                    </p>
                    <span className={`font-[family-name:var(--font-jetbrains)] text-sm font-medium px-2 py-0.5 rounded ${
                      pos.pnl >= 0 ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"
                    }`}>
                      {pos.pnlPct !== null ? (pos.pnlPct >= 0 ? "+" : "") + pos.pnlPct.toFixed(2) + "%" : ""}
                    </span>
                  </div>
                ) : (
                  <p className="font-[family-name:var(--font-jetbrains)] text-sm text-gray-500">
                    {pos.manual_value !== null ? "N/A (fonds non coté)" : "En attente des cours..."}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Poids dans l&apos;enveloppe</p>
                <p className="font-[family-name:var(--font-jetbrains)] text-sm text-gray-300">
                  {totalValue > 0 ? ((pos.value / totalValue) * 100).toFixed(1) + "%" : "—"}
                </p>
              </div>
              {pos.manual_value !== null && (
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Type</p>
                  <p className="text-xs text-gray-400">Valeur saisie manuellement (fonds non coté)</p>
                </div>
              )}
            </div>
            {/* Interactive chart */}
            {pos.yahoo_ticker && (
              <div className="px-4 pb-4 border-t border-gray-800 pt-4">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Historique du cours</p>
                <PositionChartPanel ticker={pos.yahoo_ticker} currency={pos.currency} quantity={pos.quantity ?? 1} />
              </div>
            )}

            {/* LOT 4: Dividendes (s'affiche seulement si yield > 0) */}
            {pos.yahoo_ticker && (
              <div
                className="px-4 pb-4 border-t border-gray-800 pt-4"
                onClick={(e) => e.stopPropagation()}
              >
                <PositionDividends
                  ticker={pos.ticker}
                  yahooTicker={pos.yahoo_ticker}
                  quantity={pos.quantity}
                  eurUsd={quotes?.eurUsd ?? 1.08}
                />
              </div>
            )}

            {/* LOT 2: Alerts management */}
            <div
              className="px-4 pb-4 border-t border-gray-800 pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <PositionAlerts
                positionId={pos.id}
                positionTicker={pos.ticker}
                positionCurrency={pos.currency}
                onChange={onAlertsChanged}
              />
            </div>

            <div className="px-4 pb-3 flex justify-end gap-2 border-t border-gray-800 pt-3">
              {pos.quantity !== null && (
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onBuy(pos); }}
                  className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/20 h-7 px-3 text-xs">
                  + Achat
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(pos); }}
                className="text-gray-400 hover:text-white hover:bg-[#1f2937] h-7 px-3 text-xs">
                Modifier
              </Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(pos); }}
                className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 px-3 text-xs">
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EnvelopeDetailClient({ envelope, initialPositions, backPath = "/perso/patrimoine", backLabel = "Patrimoine" }: { envelope: Envelope; initialPositions: Position[]; backPath?: string; backLabel?: string }) {
  const [positions, setPositions] = useState(initialPositions);
  const [quotes, setQuotes] = useState<QuotesResult | null>(null);
  const [returns, setReturns] = useState<ReturnsResult | null>(null);
  const [triggeredByPosition, setTriggeredByPosition] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Versements cumulés PEA (userParams.peaVersements) — utilisé pour la jauge
  // d'objectif sur les PEA : le plafond 150k€ porte sur les dépôts, pas sur
  // la valeur. Null = non renseigné → fallback cost_basis plus bas.
  const [peaDeposits, setPeaDeposits] = useState<number | null>(null);

  useEffect(() => {
    if (envelope.type !== "pea") return;
    fetch("/api/params")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Record<string, string> | null) => {
        const raw = p?.peaVersements;
        if (raw) {
          const n = parseFloat(raw);
          if (!isNaN(n)) setPeaDeposits(n);
        }
      })
      .catch(() => {});
  }, [envelope.type]);

  const fetchQuotes = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(refresh ? "/api/quotes?refresh=true" : "/api/quotes");
      if (res.ok) {
        const data: QuotesResult = await res.json();
        setQuotes(data);
        setLastUpdate(new Date(data.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch {} finally { setLoading(false); }
  }, []);

  const reloadPositions = useCallback(async () => {
    const res = await fetch(`/api/positions?envelope_id=${envelope.id}`);
    if (res.ok) setPositions(await res.json());
  }, [envelope.id]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  // LOT 1b: Fetch TRI whenever market values change (depends on terminal val)
  useEffect(() => {
    fetch("/api/returns")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ReturnsResult | null) => { if (d) setReturns(d); })
      .catch(() => {});
  }, [quotes, positions]);

  // LOT 2: Fetch alerts (triggered count per position) for bell icons
  const reloadAlerts = useCallback(() => {
    fetch(`/api/alerts?evaluate=true&envelope_id=${envelope.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.alerts) return;
        const map = new Map<number, number>();
        for (const a of d.alerts) {
          if (a.triggered && a.position_id) {
            map.set(a.position_id, (map.get(a.position_id) ?? 0) + 1);
          }
        }
        setTriggeredByPosition(map);
      })
      .catch(() => {});
  }, [envelope.id]);
  useEffect(() => { reloadAlerts(); }, [reloadAlerts, quotes]);

  function computeValue(pos: Position) {
    if (pos.manual_value !== null) return { price: null, value: pos.manual_value, pnl: null, pnlPct: null };
    if (!pos.quantity || !pos.pru) return { price: null, value: 0, pnl: null, pnlPct: null };
    const eurUsd = quotes?.eurUsd ?? 1.08;
    const quote = pos.yahoo_ticker && quotes?.quotes[pos.yahoo_ticker];
    if (quote) {
      const price = quote.price;
      const rawValue = pos.quantity * price;
      const valueEur = pos.currency === "USD" ? rawValue / eurUsd : rawValue;
      const costBasis = pos.quantity * pos.pru;
      const costBasisEur = pos.currency === "USD" ? costBasis / eurUsd : costBasis;
      const pnl = valueEur - costBasisEur;
      return { price, value: valueEur, pnl, pnlPct: costBasisEur > 0 ? (pnl / costBasisEur) * 100 : 0 };
    }
    const fallback = pos.quantity * pos.pru;
    return { price: null, value: pos.currency === "USD" ? fallback / eurUsd : fallback, pnl: null, pnlPct: null };
  }

  const enriched = positions.map((pos) => ({ ...pos, ...computeValue(pos) }));
  const totalValue = enriched.reduce((sum, p) => sum + p.value, 0);

  // Envelope-level P&L
  const envelopePnl = enriched.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const envelopeCostBasis = enriched.reduce((sum, p) => {
    if (p.pnl !== null) return sum + (p.value - p.pnl);
    return sum;
  }, 0);
  const envelopePnlPct = envelopeCostBasis > 0 ? (envelopePnl / envelopeCostBasis) * 100 : 0;
  const hasEnvelopePnl = enriched.some((p) => p.pnl !== null);

  // Buy dialog state
  const [buyTarget, setBuyTarget] = useState<Position | null>(null);
  const [buyQty, setBuyQty] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [buyIncludeFees, setBuyIncludeFees] = useState(true);
  const [buySubmitting, setBuySubmitting] = useState(false);

  // Fortuneo Pack Starter fees
  function calcFortuneoFees(orderAmount: number): number {
    if (orderAmount <= 0) return 0;
    if (orderAmount <= 500) return 0; // 1 free order/month under 500€
    return Math.max(1.95, orderAmount * 0.0035); // 0.35% with 1.95€ minimum
  }

  async function handleBuyConfirm() {
    if (!buyTarget || !buyQty || !buyPrice) return;
    setBuySubmitting(true);
    const newQty = parseFloat(buyQty);
    const newPrice = parseFloat(buyPrice);
    const orderAmount = newQty * newPrice;
    const fees = buyIncludeFees ? calcFortuneoFees(orderAmount) : 0;
    // PRU includes fees: total cost (order + fees) / quantity
    const totalCost = orderAmount + fees;
    const effectivePrice = totalCost / newQty;
    const oldQty = buyTarget.quantity ?? 0;
    const oldPru = buyTarget.pru ?? 0;
    const finalQty = oldQty + newQty;
    const finalPru = finalQty > 0 ? (oldPru * oldQty + effectivePrice * newQty) / finalQty : effectivePrice;

    await fetch("/api/positions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: buyTarget.id,
        ticker: buyTarget.ticker,
        label: buyTarget.label,
        quantity: Math.round(finalQty * 10000) / 10000,
        pru: Math.round(finalPru * 1000) / 1000,
        scenario_key: buyTarget.scenario_key,
      }),
    });
    setBuySubmitting(false);
    setBuyTarget(null);
    setBuyQty("");
    setBuyPrice("");
    await reloadPositions();
    fetchQuotes(true);
  }

  // R3: Delete with AlertDialog
  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/positions?id=${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) await reloadPositions();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function handleEdit(pos: Position) { setEditPosition(pos); setDialogOpen(true); }
  function handleAdd() { setEditPosition(null); setDialogOpen(true); }
  async function handleSaved() { await reloadPositions(); fetchQuotes(true); }

  // F3: PEA objective gauge
  // Sur PEA, le plafond (généralement 150k€) porte sur les versements cumulés,
  // pas sur la valeur de marché. On préfère peaDeposits (saisi), puis cost_basis
  // (approx), et en dernier recours totalValue (ancien comportement). Pour les
  // non-PEA, la jauge reste basée sur totalValue vs target.
  const isPea = envelope.type === "pea";
  const gaugeBase = isPea
    ? (peaDeposits ?? (envelopeCostBasis > 0 ? envelopeCostBasis : totalValue))
    : totalValue;
  const showGauge = envelope.target && envelope.target > 0;
  const gaugePct = showGauge ? Math.min(100, (gaugeBase / envelope.target!) * 100) : 0;
  const currentYear = new Date().getFullYear();
  const monthsLeft = envelope.fill_end_year ? Math.max(0, (envelope.fill_end_year - currentYear) * 12 + (12 - new Date().getMonth() - 1)) : 0;
  const monthlyNeeded = showGauge && monthsLeft > 0 ? Math.max(0, (envelope.target! - gaugeBase) / monthsLeft) : 0;

  const pnlColor = (pnl: number | null) => pnl === null ? "text-gray-500" : pnl >= 0 ? "text-emerald-400" : "text-red-400";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = positions.findIndex((p) => p.id === active.id);
    const newIndex = positions.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(positions, oldIndex, newIndex);
    setPositions(reordered);

    // Persist new order
    const order = reordered.map((p, i) => ({ id: p.id, sort_order: i }));
    await fetch("/api/positions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
  }

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <Link href={backPath} className="text-gray-500 hover:text-gray-300 transition-colors">{backLabel}</Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300">{envelope.name}</span>
        </nav>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: envelope.color }} />
            <h1 className="text-2xl font-bold text-white">{envelope.name}</h1>
            <Badge variant="outline" className="border-gray-700 text-gray-400 uppercase text-xs">{envelope.type}</Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-400">Valeur totale</p>
              <p className="text-2xl font-bold font-[family-name:var(--font-jetbrains)]" style={{ color: envelope.color }}>
                {formatEur(totalValue)}
              </p>
              {hasEnvelopePnl && (
                <p className={`text-sm font-[family-name:var(--font-jetbrains)] mt-0.5 ${envelopePnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {envelopePnl >= 0 ? "+" : ""}{formatEur(envelopePnl)}
                  <span className="text-xs ml-1">({envelopePnl >= 0 ? "+" : ""}{envelopePnlPct.toFixed(1)}%)</span>
                </p>
              )}
              {returns && (() => {
                const row = returns.envelopes.find((r) => r.envelope_id === envelope.id);
                if (!row) return null;
                return (
                  <div className="mt-0.5">
                    <TriBadge tri={row.tri_annual} cashflowCount={row.cashflow_count} coverage={row.coverage} />
                  </div>
                );
              })()}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button variant="outline" size="sm" onClick={() => fetchQuotes(true)} disabled={loading}
                className="border-gray-700 text-gray-300 hover:bg-[#161b22] hover:text-white">
                {loading ? "..." : "Actualiser"}
              </Button>
              {lastUpdate && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-gray-500">MAJ {lastUpdate}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* F3: Objective gauge */}
        {showGauge && (
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  {isPea ? "Versés : " : "Actuel : "}
                  <span className="text-white font-[family-name:var(--font-jetbrains)]">{formatEur(gaugeBase)}</span>
                  <span className="text-gray-600 mx-1">/</span>
                  <span className="text-white font-[family-name:var(--font-jetbrains)]">{formatEur(envelope.target!)}</span>
                </span>
                <span className="text-gray-400 font-[family-name:var(--font-jetbrains)]">{gaugePct.toFixed(1)}%</span>
              </div>
              <Progress value={gaugePct} className="h-2.5 bg-gray-800" style={{ ["--progress-foreground" as string]: envelope.color } as React.CSSProperties} />
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                {envelope.fill_end_year && (
                  <span>Fin : {envelope.fill_end_year} ({monthsLeft} mois restants)</span>
                )}
                {monthlyNeeded > 0 && (
                  <span>Versement requis : <span className="text-gray-300 font-[family-name:var(--font-jetbrains)]">{formatEur(monthlyNeeded)}/mois</span></span>
                )}
                {isPea && peaDeposits === null && (
                  <span className="text-amber-500/80" title="Renseigne tes versements cumulés PEA dans le profil fiscal pour une jauge exacte. En attendant, on utilise le cost basis comme approximation.">
                    ⚠ Versements estimés via cost basis — renseigne le profil fiscal
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Annual contrib (PER etc.) */}
        {!showGauge && envelope.annual_contrib && (
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="pt-4">
              <span className="text-gray-400 text-sm">Versement annuel : </span>
              <span className="text-white font-[family-name:var(--font-jetbrains)] text-sm">{formatEur(envelope.annual_contrib)}</span>
            </CardContent>
          </Card>
        )}

        {/* Envelope-level historical chart */}
        <EnvelopeChartPanel envelopeId={envelope.id} color={envelope.color} />

        {/* Positions Table */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Positions <span className="text-sm font-normal text-gray-400 ml-2">({positions.length})</span></CardTitle>
            <Button size="sm" onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">+ Ajouter</Button>
          </CardHeader>
          <Separator className="bg-gray-800" />
          <CardContent className="pt-4 space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={enriched.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {enriched.map((pos) => (
                  <SortablePositionCard
                    key={pos.id}
                    pos={pos}
                    isExpanded={expandedId === pos.id}
                    onToggle={() => setExpandedId(expandedId === pos.id ? null : pos.id)}
                    quotes={quotes}
                    totalValue={totalValue}
                    pnlColor={pnlColor}
                    onBuy={(p) => { setBuyTarget(p); setBuyQty(""); setBuyPrice(""); }}
                    onEdit={handleEdit}
                    onDelete={setDeleteTarget}
                    triRow={(() => {
                      const r = returns?.positions.find((rp) => rp.position_id === pos.id);
                      if (!r) return null;
                      return {
                        tri_annual: r.tri_annual,
                        cashflow_count: r.cashflow_count,
                        coverage: r.coverage,
                      };
                    })()}
                    triggeredCount={triggeredByPosition.get(pos.id) ?? 0}
                    onAlertsChanged={reloadAlerts}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {enriched.length === 0 && (
              <div className="text-center text-gray-500 py-8">Aucune position.</div>
            )}
          </CardContent>
        </Card>

        {/* LOT 1 — Operations journal */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardContent className="pt-5 pb-5">
            <OperationsTimeline
              envelopeId={envelope.id}
              positions={positions.map((p) => ({
                id: p.id,
                ticker: p.ticker,
                label: p.label,
                currency: p.currency,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <PositionDialog open={dialogOpen} onOpenChange={setDialogOpen} envelopeId={envelope.id} editPosition={editPosition} onSaved={handleSaved} />

      {/* R3: Delete AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-[#0d1117] border-gray-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette position ?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {deleteTarget && <>La position <span className="text-white font-medium">{deleteTarget.ticker}</span> ({deleteTarget.label}) sera supprimée définitivement.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-700 text-gray-300 hover:bg-[#161b22]">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Buy Dialog */}
      <Dialog open={!!buyTarget} onOpenChange={(open) => !open && setBuyTarget(null)}>
        <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Achat — {buyTarget?.ticker}</DialogTitle>
          </DialogHeader>
          {buyTarget && (() => {
            const qty = parseFloat(buyQty || "0");
            const price = parseFloat(buyPrice || "0");
            const orderAmount = qty * price;
            const fees = buyIncludeFees ? calcFortuneoFees(orderAmount) : 0;
            const totalCost = orderAmount + fees;
            const effectivePrice = qty > 0 ? totalCost / qty : 0;
            const oldQty = buyTarget.quantity ?? 0;
            const oldPru = buyTarget.pru ?? 0;
            const newTotalQty = oldQty + qty;
            const newPru = newTotalQty > 0 ? (oldPru * oldQty + effectivePrice * qty) / newTotalQty : effectivePrice;
            const sym = buyTarget.currency === "USD" ? "$" : "€";

            return (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">
                  Position actuelle : {oldQty.toLocaleString("fr-FR")} parts @ PRU {oldPru.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {sym}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">Quantité achetée</Label>
                    <Input type="number" step="any" value={buyQty} onChange={(e) => setBuyQty(e.target.value)}
                      placeholder="10" className="bg-[#161b22] border-gray-700 text-white" autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">Prix unitaire</Label>
                    <Input type="number" step="any" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)}
                      placeholder={oldPru.toFixed(2)} className="bg-[#161b22] border-gray-700 text-white" />
                  </div>
                </div>

                {/* Fortuneo fees toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={buyIncludeFees} onChange={(e) => setBuyIncludeFees(e.target.checked)}
                    className="rounded border-gray-600 bg-[#161b22] text-emerald-500 focus:ring-emerald-500" />
                  <span className="text-xs text-gray-400">Inclure frais Fortuneo (Pack Starter)</span>
                </label>

                {qty > 0 && price > 0 && (
                  <div className="bg-[#161b22] rounded-lg p-3 text-sm space-y-2">
                    {/* Order details */}
                    <div className="flex justify-between text-gray-400">
                      <span>Montant ordre</span>
                      <span className="font-[family-name:var(--font-jetbrains)]">{orderAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}</span>
                    </div>
                    {buyIncludeFees && (
                      <div className="flex justify-between text-gray-400">
                        <span>Frais Fortuneo {orderAmount <= 500 ? "(gratuit < 500 €)" : "(0,35%)"}</span>
                        <span className="font-[family-name:var(--font-jetbrains)] text-amber-400">
                          {fees > 0 ? fees.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + sym : "0,00 " + sym}
                        </span>
                      </div>
                    )}
                    {buyIncludeFees && fees > 0 && (
                      <div className="flex justify-between text-gray-400 border-t border-gray-700 pt-2">
                        <span>Coût total</span>
                        <span className="font-[family-name:var(--font-jetbrains)] text-white">{totalCost.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-700 pt-2 space-y-1">
                      <p className="text-gray-400">Après achat :</p>
                      <p className="text-white font-[family-name:var(--font-jetbrains)]">
                        {newTotalQty.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} parts
                      </p>
                      <p className="text-gray-300 font-[family-name:var(--font-jetbrains)] text-xs">
                        Nouveau PRU{buyIncludeFees && fees > 0 ? " (frais inclus)" : ""} : {newPru.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {sym}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setBuyTarget(null)} className="border-gray-700 text-gray-300 hover:bg-[#161b22]">
                    Annuler
                  </Button>
                  <Button onClick={handleBuyConfirm} disabled={buySubmitting || !buyQty || !buyPrice}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {buySubmitting ? "..." : "Confirmer l'achat"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </main>
  );
}
