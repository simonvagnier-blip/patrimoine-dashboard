"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Deal {
  id: number;
  contact_id: number | null;
  title: string;
  value: number | null;
  stage: string;
  probability: number;
  expected_close: string | null;
  notes: string | null;
}

interface Contact {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
}

const STAGES = [
  { key: "lead", label: "Lead", color: "#6b7280" },
  { key: "qualified", label: "Qualifi\u00e9", color: "#3b82f6" },
  { key: "proposal", label: "Proposition", color: "#f59e0b" },
  { key: "negotiation", label: "N\u00e9gociation", color: "#a78bfa" },
  { key: "won", label: "Gagn\u00e9", color: "#34d399" },
  { key: "lost", label: "Perdu", color: "#ef4444" },
];

function formatEur(v: number): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", value: "", stage: "lead", probability: "10", expected_close: "", notes: "", contact_id: "" });
  const [toast, setToast] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    const res = await fetch("/api/deals");
    if (res.ok) setDeals(await res.json());
  }, []);

  const fetchContacts = useCallback(async () => {
    const res = await fetch("/api/contacts");
    if (res.ok) setContacts(await res.json());
  }, []);

  useEffect(() => { fetchDeals(); fetchContacts(); }, [fetchDeals, fetchContacts]);

  function getContactName(contactId: number | null): string | null {
    if (!contactId) return null;
    const c = contacts.find((ct) => ct.id === contactId);
    return c ? c.name : null;
  }

  async function saveDeal() {
    await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        value: form.value ? parseFloat(form.value) : null,
        stage: form.stage,
        probability: parseInt(form.probability),
        expected_close: form.expected_close || null,
        notes: form.notes || null,
        contact_id: form.contact_id ? parseInt(form.contact_id) : null,
      }),
    });
    setDialogOpen(false);
    setForm({ title: "", value: "", stage: "lead", probability: "10", expected_close: "", notes: "", contact_id: "" });
    fetchDeals();
  }

  function dueDate(daysFromNow: number): string {
    return new Date(Date.now() + daysFromNow * 86400000).toISOString().split("T")[0];
  }

  async function createWorkflowTasks(dealTitle: string, newStage: string) {
    const taskDefs: { title: string; due_date: string; priority: string }[] = [];

    if (newStage === "proposal") {
      taskDefs.push(
        { title: `Envoyer proposition \u2014 ${dealTitle}`, due_date: dueDate(1), priority: "high" },
        { title: `Relancer \u2014 ${dealTitle}`, due_date: dueDate(3), priority: "medium" },
      );
    } else if (newStage === "negotiation") {
      taskDefs.push(
        { title: `Pr\u00e9parer n\u00e9gociation \u2014 ${dealTitle}`, due_date: dueDate(1), priority: "high" },
        { title: `Planifier d\u00e9mo \u2014 ${dealTitle}`, due_date: dueDate(5), priority: "medium" },
      );
    } else if (newStage === "won") {
      taskDefs.push(
        { title: `Onboarding client \u2014 ${dealTitle}`, due_date: dueDate(7), priority: "medium" },
      );
    }

    if (taskDefs.length === 0) return;

    await Promise.all(
      taskDefs.map((t) =>
        fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ space: "pro", ...t }),
        })
      )
    );

    setToast(`${taskDefs.length} t\u00e2che${taskDefs.length > 1 ? "s" : ""} cr\u00e9\u00e9e${taskDefs.length > 1 ? "s" : ""} automatiquement`);
    setTimeout(() => setToast(null), 3000);
  }

  async function moveStage(id: number, stage: string) {
    const deal = deals.find((d) => d.id === id);
    await fetch("/api/deals", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, stage }) });
    if (deal) {
      await createWorkflowTasks(deal.title, stage);
    }
    fetchDeals();
  }

  async function deleteDeal(id: number) {
    await fetch(`/api/deals?id=${id}`, { method: "DELETE" });
    fetchDeals();
  }

  const activeStages = STAGES.filter((s) => !["won", "lost"].includes(s.key));
  const totalPipeline = deals.filter((d) => !["won", "lost"].includes(d.stage)).reduce((s, d) => s + (d.value ?? 0), 0);
  const weightedPipeline = deals.filter((d) => !["won", "lost"].includes(d.stage)).reduce((s, d) => s + (d.value ?? 0) * d.probability / 100, 0);
  const inputCls = "bg-[#0d1220] border-gray-700 text-white";

  return (
    <main className="min-h-screen bg-[#0a0f1e] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Pipeline</h1>
            <div className="flex gap-4 text-sm mt-1">
              <span className="text-gray-400">Total : <span className="text-white font-[family-name:var(--font-jetbrains)]">{formatEur(totalPipeline)}</span></span>
              <span className="text-gray-400">Pond&eacute;r&eacute; : <span className="text-blue-400 font-[family-name:var(--font-jetbrains)]">{formatEur(weightedPipeline)}</span></span>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">+ Deal</Button>
        </div>

        {/* Kanban board */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto">
          {activeStages.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage.key);
            const stageTotal = stageDeals.reduce((s, d) => s + (d.value ?? 0), 0);
            return (
              <div key={stage.key} className="space-y-3 min-w-[220px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm font-medium text-gray-300">{stage.label}</span>
                    <span className="text-xs text-gray-500">{stageDeals.length}</span>
                  </div>
                  <span className="text-xs text-gray-500 font-[family-name:var(--font-jetbrains)]">{formatEur(stageTotal)}</span>
                </div>
                {stageDeals.map((deal) => {
                  const contactName = getContactName(deal.contact_id);
                  const weightedValue = deal.value != null ? deal.value * deal.probability / 100 : null;
                  return (
                    <Card key={deal.id} className="bg-[#0d1220] border-gray-800">
                      <CardContent className="p-3 space-y-2">
                        <p className="text-sm text-white font-medium">{deal.title}</p>
                        {contactName && (
                          <p className="text-[10px] text-blue-300">{contactName}</p>
                        )}
                        {deal.value != null && (
                          <div>
                            <p className="text-sm font-[family-name:var(--font-jetbrains)] text-blue-400">{formatEur(deal.value)}</p>
                            {weightedValue != null && (
                              <p className="text-[10px] font-[family-name:var(--font-jetbrains)] text-gray-500">
                                Pond&eacute;r&eacute; : {formatEur(weightedValue)}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-gray-500">{deal.probability}%</span>
                          <div className="flex gap-1">
                            {stage.key !== "negotiation" && (
                              <button onClick={() => {
                                const idx = activeStages.findIndex((s) => s.key === stage.key);
                                if (idx < activeStages.length - 1) moveStage(deal.id, activeStages[idx + 1].key);
                              }} className="text-gray-500 hover:text-white">&#8594;</button>
                            )}
                            <button onClick={() => moveStage(deal.id, "won")} className="text-gray-500 hover:text-emerald-400">&#10003;</button>
                            <button onClick={() => moveStage(deal.id, "lost")} className="text-gray-500 hover:text-red-400">&#10005;</button>
                            <button onClick={() => deleteDeal(deal.id)} className="text-gray-600 hover:text-red-400 ml-1">&#128465;</button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Won/Lost summary */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-[#0d1220] border-gray-800">
            <CardContent className="p-4">
              <p className="text-emerald-400 text-sm font-medium">Gagn&eacute;s</p>
              <p className="text-white font-[family-name:var(--font-jetbrains)] text-lg">
                {formatEur(deals.filter((d) => d.stage === "won").reduce((s, d) => s + (d.value ?? 0), 0))}
              </p>
              <p className="text-xs text-gray-500">{deals.filter((d) => d.stage === "won").length} deal(s)</p>
            </CardContent>
          </Card>
          <Card className="bg-[#0d1220] border-gray-800">
            <CardContent className="p-4">
              <p className="text-red-400 text-sm font-medium">Perdus</p>
              <p className="text-white font-[family-name:var(--font-jetbrains)] text-lg">
                {formatEur(deals.filter((d) => d.stage === "lost").reduce((s, d) => s + (d.value ?? 0), 0))}
              </p>
              <p className="text-xs text-gray-500">{deals.filter((d) => d.stage === "lost").length} deal(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Workflow toast notification */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1f2e] border border-gray-700 rounded-lg px-4 py-3 shadow-lg flex items-center gap-2">
            <span className="text-emerald-400 text-sm">&#10003;</span>
            <span className="text-sm text-gray-300">{toast}</span>
          </div>
        )}

        {/* Add deal dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-[#0d1220] border-gray-800 text-white max-w-md">
            <DialogHeader><DialogTitle>Nouveau deal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-gray-400 text-xs">Titre *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} /></div>
              <div>
                <Label className="text-gray-400 text-xs">Contact</Label>
                <select
                  value={form.contact_id}
                  onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                  className="w-full bg-[#0d1220] border border-gray-700 text-white rounded-md px-3 py-2 text-sm"
                >
                  <option value="">-- Aucun --</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id.toString()}>
                      {c.name}{c.company ? ` (${c.company})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-gray-400 text-xs">Montant</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={inputCls} /></div>
                <div><Label className="text-gray-400 text-xs">Probabilit&eacute; %</Label><Input type="number" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className={inputCls} /></div>
              </div>
              <div><Label className="text-gray-400 text-xs">Date de closing pr&eacute;vue</Label><Input type="date" value={form.expected_close} onChange={(e) => setForm({ ...form, expected_close: e.target.value })} className={inputCls} /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700 text-gray-300">Annuler</Button>
                <Button onClick={saveDeal} className="bg-blue-600 hover:bg-blue-700 text-white">Cr&eacute;er</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
