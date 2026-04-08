"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname } from "next/navigation";

interface Envelope { id: string; name: string; color: string; }
interface Position { id: number; envelope_id: string; ticker: string; label: string; quantity: number | null; pru: number | null; scenario_key: string; }

export default function QuickUpdateFAB() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [envId, setEnvId] = useState("");
  const [posId, setPosId] = useState("");
  const [opType, setOpType] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  if (pathname === "/login") return null;

  async function loadData() {
    const [envRes, posRes] = await Promise.all([fetch("/api/envelopes"), fetch("/api/positions")]);
    if (envRes.ok) setEnvelopes(await envRes.json());
    if (posRes.ok) setPositions(await posRes.json());
  }

  function handleOpen() {
    setOpen(true);
    setSuccess(false);
    setQty(""); setPrice(""); setPosId(""); setEnvId("");
    loadData();
  }

  const filteredPositions = positions.filter((p) => !envId || p.envelope_id === envId);
  const selectedPos = positions.find((p) => p.id.toString() === posId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPos || !qty || !price) return;
    setSaving(true);

    const newQty = parseFloat(qty);
    const newPrice = parseFloat(price);
    const oldQty = selectedPos.quantity ?? 0;
    const oldPru = selectedPos.pru ?? 0;

    let finalQty: number;
    let finalPru: number;

    if (opType === "buy") {
      finalQty = oldQty + newQty;
      finalPru = finalQty > 0 ? (oldPru * oldQty + newPrice * newQty) / finalQty : newPrice;
    } else {
      finalQty = Math.max(0, oldQty - newQty);
      finalPru = oldPru; // PRU doesn't change on sell
    }

    await fetch("/api/positions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedPos.id,
        ticker: selectedPos.ticker,
        label: selectedPos.label,
        quantity: finalQty,
        pru: Math.round(finalPru * 100) / 100,
        scenario_key: selectedPos.scenario_key,
      }),
    });

    setSaving(false);
    setSuccess(true);
    setTimeout(() => { setOpen(false); window.location.reload(); }, 1200);
  }

  const inputCls = "bg-[#161b22] border-gray-700 text-white";

  return (
    <>
      {/* FAB button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/30 flex items-center justify-center text-2xl transition-transform hover:scale-105 active:scale-95"
        title="Enregistrer une opération"
      >
        +
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Enregistrer une opération</DialogTitle>
          </DialogHeader>

          {success ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">&#10003;</div>
              <p className="text-emerald-400 font-medium">Opération enregistrée !</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type */}
              <div className="flex rounded-lg bg-[#161b22] p-0.5">
                <button type="button" onClick={() => setOpType("buy")}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${opType === "buy" ? "bg-emerald-600 text-white" : "text-gray-400"}`}>
                  Achat
                </button>
                <button type="button" onClick={() => setOpType("sell")}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${opType === "sell" ? "bg-red-600 text-white" : "text-gray-400"}`}>
                  Vente
                </button>
              </div>

              {/* Envelope */}
              <div className="space-y-2">
                <Label className="text-gray-300">Enveloppe</Label>
                <Select value={envId} onValueChange={(v) => { if (v) { setEnvId(v); setPosId(""); } }}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent className="bg-[#161b22] border-gray-700">
                    {envelopes.map((e) => (
                      <SelectItem key={e.id} value={e.id} className="text-white">{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Position */}
              <div className="space-y-2">
                <Label className="text-gray-300">Position</Label>
                <Select value={posId} onValueChange={(v) => v && setPosId(v)}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent className="bg-[#161b22] border-gray-700">
                    {filteredPositions.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()} className="text-white">
                        {p.ticker} — {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPos && (
                <p className="text-xs text-gray-500">
                  Position actuelle : {selectedPos.quantity} parts @ PRU {selectedPos.pru?.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Quantité</Label>
                  <Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="10" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Prix unitaire</Label>
                  <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="48.50" className={inputCls} />
                </div>
              </div>

              {selectedPos && qty && price && (
                <div className="bg-[#161b22] rounded-lg p-3 text-sm space-y-1">
                  <p className="text-gray-400">Après opération :</p>
                  <p className="text-white font-[family-name:var(--font-jetbrains)]">
                    {opType === "buy"
                      ? `${((selectedPos.quantity ?? 0) + parseFloat(qty || "0")).toLocaleString("fr-FR")} parts`
                      : `${Math.max(0, (selectedPos.quantity ?? 0) - parseFloat(qty || "0")).toLocaleString("fr-FR")} parts`
                    }
                    {opType === "buy" && ` @ PRU ${(((selectedPos.pru ?? 0) * (selectedPos.quantity ?? 0) + parseFloat(price || "0") * parseFloat(qty || "0")) / ((selectedPos.quantity ?? 0) + parseFloat(qty || "0"))).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </p>
                </div>
              )}

              <Button type="submit" disabled={saving || !selectedPos || !qty || !price}
                className={`w-full ${opType === "buy" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"} text-white`}>
                {saving ? "Enregistrement..." : opType === "buy" ? "Confirmer l'achat" : "Confirmer la vente"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
