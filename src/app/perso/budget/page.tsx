"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import BudgetTrendPanel from "@/components/BudgetTrendPanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CATEGORIES } from "@/lib/budget-rules";

interface BudgetEntry {
  id: number;
  type: string;
  category: string;
  label: string;
  amount: number;
  date: string;
  recurring: number;
}

type Bucket = "expense" | "income" | "invest" | "transfer";

// Taxonomie unifiée importée de lib/budget-rules (source de vérité)
const CATEGORY_OPTIONS = {
  income: [...CATEGORIES.income],
  expense: [...CATEGORIES.expense, ...CATEGORIES.savings, ...CATEGORIES.transfer],
};

function formatEur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: d });
}

/** Détermine le "bucket" d'une entrée : dépense de conso, revenu, investissement, ou transfert interne. */
function bucketOf(e: BudgetEntry): Bucket {
  const cat = e.category.toLowerCase();
  if (cat === "transfert interne") return "transfer";
  if (cat.startsWith("investissement") || cat.startsWith("épargne ") || cat.startsWith("epargne ")) return "invest";
  return e.type === "income" ? "income" : "expense";
}

function bucketColor(b: Bucket): string {
  switch (b) {
    case "income": return "text-emerald-400";
    case "expense": return "text-red-400";
    case "invest": return "text-sky-400";
    case "transfer": return "text-gray-500";
  }
}

function bucketLabel(b: Bucket): string {
  switch (b) {
    case "income": return "Revenu";
    case "expense": return "Dépense";
    case "invest": return "Épargne/invest";
    case "transfer": return "Transfert interne";
  }
}

const PAGE_SIZE = 50;

export default function BudgetPage() {
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterBuckets, setFilterBuckets] = useState<Set<Bucket>>(new Set(["expense", "income", "invest"]));
  const [filterCategory, setFilterCategory] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Add dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ type: "expense", category: "Alimentation", label: "", amount: "", date: new Date().toISOString().split("T")[0], recurring: false });
  const [toDelete, setToDelete] = useState<number | null>(null);
  const [trendKey, setTrendKey] = useState(0);

  // Edit inline catégorie : id de l'entrée en cours d'édition
  const [editingCat, setEditingCat] = useState<number | null>(null);
  // Confirmation "appliquer à N autres transactions avec le même libellé"
  const [bulkPrompt, setBulkPrompt] = useState<{
    label: string;
    category: string;
    count: number;
  } | null>(null);
  // View mode : transactions ou agrégat par vendeur
  const [viewMode, setViewMode] = useState<"list" | "vendors">("list");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/budget");
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Défaut du filtre date : mois courant
  useEffect(() => {
    if (!dateFrom && !dateTo && entries.length > 0) {
      const now = new Date();
      const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      setDateFrom(first);
    }
  }, [entries.length, dateFrom, dateTo]);

  // Liste filtrée (client-side, on a tout en mémoire)
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo) return false;
      if (!filterBuckets.has(bucketOf(e))) return false;
      if (filterCategory !== "__all__" && e.category !== filterCategory) return false;
      if (s && !(`${e.label} ${e.category}`.toLowerCase().includes(s))) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }, [entries, dateFrom, dateTo, filterBuckets, filterCategory, search]);

  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Agrégats sur la fenêtre filtrée (exclut transferts internes)
  const stats = useMemo(() => {
    let inc = 0, exp = 0, inv = 0, trans = 0;
    for (const e of filtered) {
      const b = bucketOf(e);
      if (b === "income") inc += e.amount;
      else if (b === "expense") exp += e.amount;
      else if (b === "invest") inv += e.amount;
      else trans += e.amount;
    }
    const savings = inc - exp; // vraie épargne de conso
    const rate = inc > 0 ? (savings / inc) * 100 : 0;
    return { inc, exp, inv, trans, savings, rate, n: filtered.length };
  }, [filtered]);

  // Liste unique des catégories présentes dans la fenêtre, pour le filtre
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.category);
    return [...set].sort();
  }, [entries]);

  // Agrégat par libellé sur la fenêtre filtrée (pour le "Top vendeurs")
  const vendorAggregates = useMemo(() => {
    const map = new Map<
      string,
      { label: string; total: number; count: number; category: string; isExpense: boolean }
    >();
    for (const e of filtered) {
      const b = bucketOf(e);
      if (b === "transfer") continue; // transferts internes exclus de l'agrégat
      const key = e.label;
      const entry = map.get(key) ?? {
        label: e.label,
        total: 0,
        count: 0,
        category: e.category,
        isExpense: b === "expense",
      };
      entry.total += e.amount;
      entry.count++;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  function toggleBucket(b: Bucket) {
    setFilterBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next;
    });
    setPage(0);
  }

  async function updateEntryCategory(id: number, newCategory: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    // 1. Update this entry
    await fetch("/api/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category: newCategory }),
    });
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, category: newCategory } : e)));
    setEditingCat(null);
    setTrendKey((k) => k + 1);

    // 2. Compte combien d'autres entrées partagent ce libellé exact
    //    ET ont une catégorie différente. Si >0, propose le bulk apply.
    const similar = entries.filter(
      (e) => e.id !== id && e.label === entry.label && e.category !== newCategory,
    );
    if (similar.length > 0) {
      setBulkPrompt({ label: entry.label, category: newCategory, count: similar.length });
    }
  }

  /**
   * Valide le bulk : met à jour toutes les entrées avec le même libellé + crée
   * une règle persistante pour les futurs imports CSV.
   */
  async function applyBulkRule(persist: boolean) {
    if (!bulkPrompt) return;
    const { label, category } = bulkPrompt;
    if (persist) {
      // Crée/upsert la règle ET applique aux entrées existantes
      await fetch("/api/budget/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: label,
          category,
          matchType: "exact",
          applyToExisting: true,
        }),
      });
    } else {
      // Juste re-cat les entrées existantes (pas de règle persistée)
      await fetch("/api/budget/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, category, matchType: "exact" }),
      });
    }
    // Recharge les entrées pour refléter les changements
    await fetchAll();
    setTrendKey((k) => k + 1);
    setBulkPrompt(null);
  }

  async function saveEntry() {
    await fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type, category: form.category, label: form.label || form.category,
        amount: parseFloat(form.amount), date: form.date, recurring: form.recurring ? 1 : 0,
      }),
    });
    setDialogOpen(false);
    setForm({ type: "expense", category: "Alimentation", label: "", amount: "", date: new Date().toISOString().split("T")[0], recurring: false });
    fetchAll();
    setTrendKey((k) => k + 1);
  }

  async function deleteEntryConfirmed() {
    if (toDelete === null) return;
    await fetch(`/api/budget?id=${toDelete}`, { method: "DELETE" });
    fetchAll();
    setTrendKey((k) => k + 1);
    setToDelete(null);
  }

  const inputCls = "bg-[#0d1117] border-gray-700 text-white";

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Budget</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {entries.length} transactions — recherche, filtre et re-catégorisation
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            + Entrée
          </Button>
        </div>

        <BudgetTrendPanel refreshKey={trendKey} />

        {/* Barre de filtres */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-gray-500 text-[11px] uppercase tracking-wider">Du</Label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  className={`${inputCls} w-40 text-sm`} />
              </div>
              <div>
                <Label className="text-gray-500 text-[11px] uppercase tracking-wider">Au</Label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                  className={`${inputCls} w-40 text-sm`} />
              </div>
              <div className="flex gap-1 flex-wrap items-center pb-0.5">
                {(["expense", "income", "invest", "transfer"] as Bucket[]).map((b) => (
                  <button key={b} onClick={() => toggleBucket(b)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      filterBuckets.has(b)
                        ? `bg-[#161b22] ${bucketColor(b)} border-gray-600`
                        : "bg-transparent text-gray-600 border-gray-800 hover:border-gray-700"
                    }`}>
                    {bucketLabel(b)}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label className="text-gray-500 text-[11px] uppercase tracking-wider">Recherche</Label>
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Vendeur, catégorie…"
                  className={`${inputCls} text-sm`} />
              </div>
              <div className="w-56">
                <Label className="text-gray-500 text-[11px] uppercase tracking-wider">Catégorie</Label>
                <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v ?? "__all__"); setPage(0); }}>
                  <SelectTrigger className={`${inputCls} text-sm`}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border-gray-700 max-h-80">
                    <SelectItem value="__all__" className="text-white">Toutes</SelectItem>
                    {availableCategories.map((c) => (
                      <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Résumé de la fenêtre filtrée */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-gray-800">
              <Stat label="Revenus" value={stats.inc} color="text-emerald-400" sub={`${stats.n} ops`} />
              <Stat label="Dépenses conso" value={stats.exp} color="text-red-400" />
              <Stat label="Épargne / invest" value={stats.inv} color="text-sky-400" />
              <Stat label="Transferts internes" value={stats.trans} color="text-gray-500" sub="(exclus du taux)" />
              <Stat
                label="Épargne nette"
                value={stats.savings}
                color={stats.savings >= 0 ? "text-emerald-400" : "text-red-400"}
                sub={stats.inc > 0 ? `taux ${stats.rate.toFixed(0)}%` : ""}
              />
            </div>
          </CardContent>
        </Card>

        {/* Switch de vue : liste vs agrégat par vendeur */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("list")}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              viewMode === "list"
                ? "bg-[#0d1117] text-white border-gray-600"
                : "bg-transparent text-gray-500 border-gray-800 hover:border-gray-700"
            }`}
          >
            Transactions
          </button>
          <button
            onClick={() => setViewMode("vendors")}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              viewMode === "vendors"
                ? "bg-[#0d1117] text-white border-gray-600"
                : "bg-transparent text-gray-500 border-gray-800 hover:border-gray-700"
            }`}
          >
            Cumul par vendeur
          </button>
        </div>

        {/* Vue 1 : Tableau des transactions */}
        {viewMode === "list" && (
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-white text-sm">
              {filtered.length} transaction{filtered.length > 1 ? "s" : ""}
              {filtered.length > PAGE_SIZE && (
                <span className="text-gray-500 font-normal ml-2">
                  (affichage {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)})
                </span>
              )}
            </CardTitle>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-2 py-1 rounded bg-[#161b22] text-gray-300 disabled:opacity-30">←</button>
                <span className="text-gray-500">{page + 1} / {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="px-2 py-1 rounded bg-[#161b22] text-gray-300 disabled:opacity-30">→</button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-0.5 p-0">
            {loading && <p className="text-gray-500 text-sm text-center py-6">Chargement…</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-6">Aucune transaction avec ces filtres.</p>
            )}
            {pageEntries.map((e) => {
              const b = bucketOf(e);
              const color = bucketColor(b);
              const isEditingThis = editingCat === e.id;
              return (
                <div key={e.id} className="flex items-center gap-3 py-2 px-4 hover:bg-[#161b22] group border-b border-gray-900/50 last:border-0">
                  <span className={`w-1 h-8 rounded-full ${b === "income" ? "bg-emerald-400" : b === "expense" ? "bg-red-400" : b === "invest" ? "bg-sky-400" : "bg-gray-600"}`} />
                  <span className="text-xs text-gray-500 font-[family-name:var(--font-jetbrains)] w-20 shrink-0">{e.date}</span>
                  <span className="text-sm text-white flex-1 truncate" title={e.label}>{e.label}</span>
                  {isEditingThis ? (
                    <Select
                      defaultValue={e.category}
                      onValueChange={(v) => v && updateEntryCategory(e.id, v)}
                    >
                      <SelectTrigger className={`${inputCls} text-xs h-7 w-48`}><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0d1117] border-gray-700 max-h-80">
                        {CATEGORY_OPTIONS.expense.map((c) => (
                          <SelectItem key={`e-${c}`} value={c} className="text-white text-xs">{c}</SelectItem>
                        ))}
                        <SelectItem value="__divider__" disabled className="text-gray-600 text-[10px] uppercase">— revenus —</SelectItem>
                        {CATEGORY_OPTIONS.income.map((c) => (
                          <SelectItem key={`i-${c}`} value={c} className="text-white text-xs">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <button
                      onClick={() => setEditingCat(e.id)}
                      className="text-xs text-gray-400 hover:text-white bg-[#161b22] hover:bg-gray-800 px-2 py-1 rounded cursor-pointer transition-colors"
                      title="Cliquer pour re-catégoriser"
                    >
                      {e.category}
                    </button>
                  )}
                  <Badge variant="outline" className={`text-[10px] border-gray-800 ${color} shrink-0`}>{bucketLabel(b)}</Badge>
                  <span className={`text-sm font-[family-name:var(--font-jetbrains)] w-24 text-right ${color} shrink-0`}>
                    {e.type === "income" ? "+" : "-"}{formatEur(e.amount, 2)}
                  </span>
                  <button onClick={() => setToDelete(e.id)}
                    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
                    title="Supprimer">
                    ✕
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
        )}

        {/* Vue 2 : Cumul par vendeur (agrégat du même libellé exact) */}
        {viewMode === "vendors" && (
          <Card className="bg-[#0d1117] border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">
                {vendorAggregates.length} libellé{vendorAggregates.length > 1 ? "s" : ""} distinct{vendorAggregates.length > 1 ? "s" : ""}
                <span className="text-gray-500 font-normal ml-2">
                  (transferts internes exclus)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5 p-0">
              {vendorAggregates.slice(0, 100).map((v) => (
                <button
                  key={v.label}
                  onClick={() => {
                    // Click → filtre la vue par ce libellé exact
                    setSearch(v.label);
                    setViewMode("list");
                    setPage(0);
                  }}
                  className="flex items-center gap-3 py-2 px-4 hover:bg-[#161b22] w-full text-left border-b border-gray-900/50 last:border-0 transition-colors"
                  title="Cliquer pour filtrer les transactions de ce vendeur"
                >
                  <span className={`w-1 h-8 rounded-full ${v.isExpense ? "bg-red-400" : "bg-emerald-400"}`} />
                  <span className="text-sm text-white flex-1 truncate">{v.label}</span>
                  <span className="text-xs text-gray-500 w-24 truncate">{v.category}</span>
                  <span className="text-xs text-gray-500 w-16 text-right">{v.count}x</span>
                  <span className={`text-sm font-[family-name:var(--font-jetbrains)] w-28 text-right ${v.isExpense ? "text-red-400" : "text-emerald-400"}`}>
                    {v.isExpense ? "-" : "+"}{formatEur(v.total, 0)}
                  </span>
                </button>
              ))}
              {vendorAggregates.length > 100 && (
                <p className="text-xs text-gray-600 text-center py-3">
                  + {vendorAggregates.length - 100} autres libellés (affine tes filtres pour les voir)
                </p>
              )}
              {vendorAggregates.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-6">Aucun vendeur avec ces filtres.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dialog confirmation bulk re-catégorisation */}
        <Dialog open={bulkPrompt !== null} onOpenChange={(open) => { if (!open) setBulkPrompt(null); }}>
          <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-md">
            <DialogHeader>
              <DialogTitle>Appliquer à {bulkPrompt?.count} autre{bulkPrompt && bulkPrompt.count > 1 ? "s" : ""} transaction{bulkPrompt && bulkPrompt.count > 1 ? "s" : ""} ?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-gray-300">
                {bulkPrompt?.count} autre{bulkPrompt && bulkPrompt.count > 1 ? "s" : ""} transaction{bulkPrompt && bulkPrompt.count > 1 ? "s" : ""} avec le libellé <span className="font-mono text-white bg-[#161b22] px-1.5 py-0.5 rounded">{bulkPrompt?.label}</span> peu{bulkPrompt && bulkPrompt.count > 1 ? "vent" : "t"} être re-catégorisée{bulkPrompt && bulkPrompt.count > 1 ? "s" : ""} en <span className="text-emerald-400 font-medium">{bulkPrompt?.category}</span>.
              </p>
              <p className="text-xs text-gray-500">
                Si tu persistes la règle, tous les futurs imports CSV appliqueront automatiquement cette catégorie pour ce libellé.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={() => applyBulkRule(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                >
                  Appliquer + persister la règle (recommandé)
                </Button>
                <Button
                  onClick={() => applyBulkRule(false)}
                  variant="outline"
                  className="border-gray-700 text-gray-300 w-full"
                >
                  Appliquer seulement aux existantes
                </Button>
                <Button
                  onClick={() => setBulkPrompt(null)}
                  variant="outline"
                  className="border-gray-800 text-gray-500 w-full"
                >
                  Non, garder cette seule entrée
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-sm">
            <DialogHeader><DialogTitle>Nouvelle entrée</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex rounded-lg bg-[#161b22] p-0.5">
                <button onClick={() => setForm({ ...form, type: "expense", category: "Alimentation" })}
                  className={`flex-1 py-1.5 text-sm rounded-md ${form.type === "expense" ? "bg-red-600 text-white" : "text-gray-400"}`}>Dépense</button>
                <button onClick={() => setForm({ ...form, type: "income", category: "Salaire" })}
                  className={`flex-1 py-1.5 text-sm rounded-md ${form.type === "income" ? "bg-emerald-600 text-white" : "text-gray-400"}`}>Revenu</button>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => v && setForm({ ...form, category: v })}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border-gray-700 max-h-80">
                    {CATEGORY_OPTIONS[form.type as "income" | "expense"].map((c) => (
                      <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Description</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Détail…" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-gray-400 text-xs">Montant</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} /></div>
                <div><Label className="text-gray-400 text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700 text-gray-300">Annuler</Button>
                <Button onClick={saveEntry} disabled={!form.amount}
                  className={`${form.type === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"} text-white`}>Ajouter</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={toDelete !== null}
          onOpenChange={(open) => { if (!open) setToDelete(null); }}
          title="Supprimer cette entrée ?"
          description="L'entrée sera définitivement retirée du budget. Les agrégats seront recalculés."
          onConfirm={deleteEntryConfirmed}
        />
      </div>
    </main>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-lg font-bold font-[family-name:var(--font-jetbrains)] ${color}`}>
        {formatEur(value)}
      </p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
