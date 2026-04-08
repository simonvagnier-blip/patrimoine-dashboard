"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BudgetEntry {
  id: number;
  type: string;
  category: string;
  label: string;
  amount: number;
  date: string;
  recurring: number;
}

const DEFAULT_CATEGORIES = {
  income: ["Salaire", "Freelance", "Investissements", "Autre"],
  expense: ["Loyer", "Courses", "Transport", "Loisirs", "Abonnements", "Santé", "Restaurants", "Shopping", "Investissement PEA", "Investissement PER", "Investissement AV", "Autre"],
};

// R5: Default budget limits per category (editable later)
const BUDGET_LIMITS: Record<string, number> = {
  "Loyer": 1200, "Courses": 400, "Transport": 150, "Loisirs": 200,
  "Abonnements": 100, "Santé": 100, "Restaurants": 200, "Shopping": 150,
};

function formatEur(v: number): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function BudgetPage() {
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ type: "expense", category: "Courses", label: "", amount: "", date: new Date().toISOString().split("T")[0], recurring: false });

  const fetchEntries = useCallback(async () => {
    const res = await fetch(`/api/budget?month=${month}`);
    if (res.ok) setEntries(await res.json());
  }, [month]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

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
    setForm({ type: "expense", category: "Courses", label: "", amount: "", date: new Date().toISOString().split("T")[0], recurring: false });
    fetchEntries();
  }

  async function deleteEntry(id: number) {
    await fetch(`/api/budget?id=${id}`, { method: "DELETE" });
    fetchEntries();
  }

  const incomes = entries.filter((e) => e.type === "income");
  const expenses = entries.filter((e) => e.type === "expense");
  const totalIncome = incomes.reduce((s, e) => s + e.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const balance = totalIncome - totalExpenses;

  // Group expenses by category
  const expByCategory: Record<string, number> = {};
  expenses.forEach((e) => { expByCategory[e.category] = (expByCategory[e.category] || 0) + e.amount; });
  const sortedCategories = Object.entries(expByCategory).sort(([, a], [, b]) => b - a);

  const inputCls = "bg-[#0d1117] border-gray-700 text-white";
  const monthLabel = new Date(month + "-15").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Budget</h1>
          <div className="flex gap-2 items-center">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="bg-[#0d1117] border-gray-700 text-white text-sm w-40" />
            <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">+ Entrée</Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="p-4">
              <p className="text-xs text-gray-400">Revenus</p>
              <p className="text-lg font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">{formatEur(totalIncome)}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="p-4">
              <p className="text-xs text-gray-400">Dépenses</p>
              <p className="text-lg font-bold text-red-400 font-[family-name:var(--font-jetbrains)]">{formatEur(totalExpenses)}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="p-4">
              <p className="text-xs text-gray-400">Épargne</p>
              <p className={`text-lg font-bold font-[family-name:var(--font-jetbrains)] ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatEur(balance)}
              </p>
              {totalIncome > 0 && (
                <p className="text-[10px] text-gray-500 mt-1">
                  Taux : <span className={`font-[family-name:var(--font-jetbrains)] ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {((balance / totalIncome) * 100).toFixed(0)}%
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* R5: Expense breakdown with budget limits */}
        {sortedCategories.length > 0 && (
          <Card className="bg-[#0d1117] border-gray-800">
            <CardHeader><CardTitle className="text-white text-sm">Dépenses par catégorie</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {sortedCategories.map(([cat, amount]) => {
                const limit = BUDGET_LIMITS[cat];
                const pct = limit ? (amount / limit) * 100 : (amount / totalExpenses) * 100;
                const barColor = limit
                  ? pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"
                  : "bg-red-400/60";
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{cat}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-[family-name:var(--font-jetbrains)] text-gray-400">{formatEur(amount)}</span>
                        {limit && (
                          <span className={`text-[10px] font-[family-name:var(--font-jetbrains)] ${pct >= 100 ? "text-red-400" : pct >= 80 ? "text-amber-400" : "text-gray-500"}`}>
                            / {formatEur(limit)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    {limit && pct >= 80 && (
                      <p className={`text-[10px] ${pct >= 100 ? "text-red-400" : "text-amber-400"}`}>
                        {pct >= 100 ? `Dépassé de ${formatEur(amount - limit)}` : `${(100 - pct).toFixed(0)}% restant`}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Entries list */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader><CardTitle className="text-white text-sm">Entrées — {monthLabel}</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {entries.length === 0 && <p className="text-gray-500 text-sm text-center py-4">Aucune entrée ce mois-ci</p>}
            {entries.sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-[#161b22] group">
                <span className={`w-1.5 h-6 rounded-full ${e.type === "income" ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="text-xs text-gray-500 font-[family-name:var(--font-jetbrains)] w-16">{e.date.slice(5)}</span>
                <span className="text-sm text-white flex-1">{e.label}</span>
                <span className="text-xs text-gray-500">{e.category}</span>
                <span className={`text-sm font-[family-name:var(--font-jetbrains)] ${e.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                  {e.type === "income" ? "+" : "-"}{formatEur(e.amount)}
                </span>
                <button onClick={() => deleteEntry(e.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs">&#10005;</button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Add dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-sm">
            <DialogHeader><DialogTitle>Nouvelle entrée</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex rounded-lg bg-[#161b22] p-0.5">
                <button onClick={() => setForm({ ...form, type: "expense", category: "Courses" })}
                  className={`flex-1 py-1.5 text-sm rounded-md ${form.type === "expense" ? "bg-red-600 text-white" : "text-gray-400"}`}>Dépense</button>
                <button onClick={() => setForm({ ...form, type: "income", category: "Salaire" })}
                  className={`flex-1 py-1.5 text-sm rounded-md ${form.type === "income" ? "bg-emerald-600 text-white" : "text-gray-400"}`}>Revenu</button>
              </div>
              <div><Label className="text-gray-400 text-xs">Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => v && setForm({ ...form, category: v })}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border-gray-700">
                    {DEFAULT_CATEGORIES[form.type as "income" | "expense"].map((c) => (
                      <SelectItem key={c} value={c} className="text-white">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-gray-400 text-xs">Description</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Détail..." className={inputCls} /></div>
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
      </div>
    </main>
  );
}
