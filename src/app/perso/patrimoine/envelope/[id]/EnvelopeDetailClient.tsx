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
import Link from "next/link";
import type { QuotesResult } from "@/lib/quotes";

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

export default function EnvelopeDetailClient({ envelope, initialPositions }: { envelope: Envelope; initialPositions: Position[] }) {
  const [positions, setPositions] = useState(initialPositions);
  const [quotes, setQuotes] = useState<QuotesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
  const showGauge = envelope.target && envelope.target > 0;
  const gaugePct = showGauge ? Math.min(100, (totalValue / envelope.target!) * 100) : 0;
  const currentYear = new Date().getFullYear();
  const monthsLeft = envelope.fill_end_year ? Math.max(0, (envelope.fill_end_year - currentYear) * 12 + (12 - new Date().getMonth() - 1)) : 0;
  const monthlyNeeded = showGauge && monthsLeft > 0 ? Math.max(0, (envelope.target! - totalValue) / monthsLeft) : 0;

  const pnlColor = (pnl: number | null) => pnl === null ? "text-gray-500" : pnl >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* R2: Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-300 transition-colors">Dashboard</Link>
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
                <span className="text-gray-400">Objectif : <span className="text-white font-[family-name:var(--font-jetbrains)]">{formatEur(envelope.target!)}</span></span>
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

        {/* Positions Table */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Positions <span className="text-sm font-normal text-gray-400 ml-2">({positions.length})</span></CardTitle>
            <Button size="sm" onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">+ Ajouter</Button>
          </CardHeader>
          <Separator className="bg-gray-800" />
          <CardContent className="pt-4 space-y-3">
            {enriched.map((pos) => {
              const sym = pos.currency === "USD" ? "$" : "€";
              const isExpanded = expandedId === pos.id;
              const costBasis = pos.quantity && pos.pru ? pos.quantity * pos.pru : null;
              const costBasisEur = costBasis !== null && pos.currency === "USD" ? costBasis / (quotes?.eurUsd ?? 1.08) : costBasis;
              const variationPct = pos.price !== null && pos.pru ? ((pos.price - pos.pru) / pos.pru) * 100 : null;

              return (
                <div key={pos.id} className={`bg-[#161b22] rounded-lg overflow-hidden transition-all duration-200 ${isExpanded ? "ring-1 ring-gray-700" : "hover:ring-1 hover:ring-gray-800"}`}>
                  {/* Main row — clickable to expand */}
                  <div
                    className="p-3 sm:p-4 cursor-pointer hover:bg-[#1c2333] transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : pos.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-[family-name:var(--font-jetbrains)] text-sm font-bold text-white shrink-0">{pos.ticker}</span>
                        <span className="text-sm text-gray-400 truncate hidden sm:inline">{pos.label}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
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
                        </div>
                        <span className={`text-gray-500 text-xs transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>&#9660;</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-1 sm:hidden">{pos.label}</p>
                  </div>

                  {/* Expanded detail panel with animation */}
                  <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                    <div className="border-t border-gray-800 bg-[#0d1117]">
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {/* Quantité */}
                        {pos.quantity !== null && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Quantité</p>
                            <p className="font-[family-name:var(--font-jetbrains)] text-sm text-white">
                              {pos.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}
                            </p>
                          </div>
                        )}

                        {/* PRU */}
                        {pos.pru !== null && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Prix de revient (PRU)</p>
                            <p className="font-[family-name:var(--font-jetbrains)] text-sm text-white">
                              {pos.pru.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {sym}
                            </p>
                          </div>
                        )}

                        {/* Cours actuel */}
                        {pos.price !== null && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Cours actuel</p>
                            <p className="font-[family-name:var(--font-jetbrains)] text-sm text-white">
                              {pos.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}
                            </p>
                          </div>
                        )}

                        {/* Variation depuis PRU */}
                        {variationPct !== null && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Variation / PRU</p>
                            <p className={`font-[family-name:var(--font-jetbrains)] text-sm font-medium ${variationPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {variationPct >= 0 ? "+" : ""}{variationPct.toFixed(2)}%
                              <span className="text-xs text-gray-500 ml-1">
                                ({pos.price !== null && pos.pru ? (pos.price >= pos.pru ? "+" : "") + (pos.price - pos.pru).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + sym : ""})
                              </span>
                            </p>
                          </div>
                        )}

                        {/* Coût d'acquisition */}
                        {costBasisEur !== null && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Coût d&apos;acquisition</p>
                            <p className="font-[family-name:var(--font-jetbrains)] text-sm text-gray-300">
                              {formatEur(costBasisEur)}
                            </p>
                          </div>
                        )}

                        {/* P&L — replaces "Valeur actuelle" since it's already in the card header */}
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

                        {/* Poids */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Poids dans l&apos;enveloppe</p>
                          <p className="font-[family-name:var(--font-jetbrains)] text-sm text-gray-300">
                            {totalValue > 0 ? ((pos.value / totalValue) * 100).toFixed(1) + "%" : "—"}
                          </p>
                        </div>

                        {/* Valeur manuelle info */}
                        {pos.manual_value !== null && (
                          <div className="col-span-2 sm:col-span-4">
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Type</p>
                            <p className="text-xs text-gray-400">Valeur saisie manuellement (fonds non coté)</p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="px-4 pb-3 flex justify-end gap-2 border-t border-gray-800 pt-3">
                        {pos.quantity !== null && (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setBuyTarget(pos); setBuyQty(""); setBuyPrice(""); }}
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/20 h-7 px-3 text-xs">
                            + Achat
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(pos); }}
                          className="text-gray-400 hover:text-white hover:bg-[#1f2937] h-7 px-3 text-xs">
                          Modifier
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(pos); }}
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 px-3 text-xs">
                          Supprimer
                        </Button>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {enriched.length === 0 && (
              <div className="text-center text-gray-500 py-8">Aucune position.</div>
            )}
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
