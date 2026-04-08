"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SCENARIO_OPTIONS_QUOTED = [
  { value: "sp", label: "S&P 500" },
  { value: "wd", label: "MSCI World" },
  { value: "em", label: "Emerging Markets" },
  { value: "nq", label: "Nasdaq-100" },
  { value: "tech", label: "Tech/Growth" },
  { value: "energy", label: "Énergie" },
];

const SCENARIO_OPTIONS_MANUAL = [
  { value: "fg", label: "Fonds garanti" },
  { value: "fe", label: "Fonds euros" },
  { value: "cash", label: "Cash" },
];

type PositionMode = "quoted" | "manual";

interface PositionFormData {
  id?: number;
  envelope_id: string;
  ticker: string;
  yahoo_ticker: string;
  label: string;
  isin: string;
  quantity: string;
  pru: string;
  manual_value: string;
  scenario_key: string;
  currency: string;
}

interface PositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envelopeId: string;
  editPosition?: {
    id: number;
    ticker: string;
    yahoo_ticker: string | null;
    label: string;
    isin: string | null;
    quantity: number | null;
    pru: number | null;
    manual_value: number | null;
    scenario_key: string;
    currency: string;
  } | null;
  onSaved: () => void;
}

const emptyForm = (envelopeId: string): PositionFormData => ({
  envelope_id: envelopeId,
  ticker: "", yahoo_ticker: "", label: "", isin: "",
  quantity: "", pru: "", manual_value: "",
  scenario_key: "wd", currency: "EUR",
});

function detectMode(pos: { manual_value: number | null; scenario_key: string } | null): PositionMode {
  if (!pos) return "quoted";
  if (pos.manual_value !== null || ["fg", "fe", "cash"].includes(pos.scenario_key)) return "manual";
  return "quoted";
}

export default function PositionDialog({ open, onOpenChange, envelopeId, editPosition, onSaved }: PositionDialogProps) {
  const [form, setForm] = useState<PositionFormData>(emptyForm(envelopeId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // R10: Toggle mode
  const [mode, setMode] = useState<PositionMode>("quoted");

  const isEdit = !!editPosition;

  useEffect(() => {
    if (editPosition) {
      setForm({
        id: editPosition.id, envelope_id: envelopeId,
        ticker: editPosition.ticker, yahoo_ticker: editPosition.yahoo_ticker || "",
        label: editPosition.label, isin: editPosition.isin || "",
        quantity: editPosition.quantity?.toString() || "", pru: editPosition.pru?.toString() || "",
        manual_value: editPosition.manual_value?.toString() || "",
        scenario_key: editPosition.scenario_key, currency: editPosition.currency,
      });
      setMode(detectMode(editPosition));
    } else {
      setForm(emptyForm(envelopeId));
      setMode("quoted");
    }
    setError("");
  }, [editPosition, envelopeId, open]);

  function updateField(field: keyof PositionFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function switchMode(newMode: PositionMode) {
    setMode(newMode);
    if (newMode === "quoted") {
      setForm((prev) => ({ ...prev, manual_value: "", scenario_key: "wd" }));
    } else {
      setForm((prev) => ({ ...prev, quantity: "", pru: "", yahoo_ticker: "", scenario_key: "fe" }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    if (!form.ticker || !form.label || !form.scenario_key) {
      setError("Ticker, libellé et classe d'actifs sont requis.");
      setSaving(false);
      return;
    }
    const payload = {
      ...(isEdit ? { id: form.id } : {}),
      envelope_id: envelopeId, ticker: form.ticker,
      yahoo_ticker: mode === "quoted" ? (form.yahoo_ticker || null) : null,
      label: form.label, isin: form.isin || null,
      quantity: mode === "quoted" && form.quantity ? parseFloat(form.quantity) : null,
      pru: mode === "quoted" && form.pru ? parseFloat(form.pru) : null,
      manual_value: mode === "manual" && form.manual_value ? parseFloat(form.manual_value) : null,
      scenario_key: form.scenario_key, currency: form.currency,
    };
    try {
      const res = await fetch("/api/positions", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Erreur serveur"); }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  const scenarioOptions = mode === "quoted" ? SCENARIO_OPTIONS_QUOTED : SCENARIO_OPTIONS_MANUAL;
  const inputCls = "bg-[#161b22] border-gray-700 text-white";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la position" : "Ajouter une position"}</DialogTitle>
        </DialogHeader>

        {/* R10: Mode toggle */}
        <div className="flex rounded-lg bg-[#161b22] p-0.5 mb-2">
          <button
            type="button"
            onClick={() => switchMode("quoted")}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === "quoted" ? "bg-[#0d1117] text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            ETF / Action cotée
          </button>
          <button
            type="button"
            onClick={() => switchMode("manual")}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === "manual" ? "bg-[#0d1117] text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            Fonds euros / garanti
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Ticker *</Label>
              <Input value={form.ticker} onChange={(e) => updateField("ticker", e.target.value)} placeholder={mode === "quoted" ? "PE500" : "Fonds €"} className={inputCls} />
            </div>
            {mode === "quoted" && (
              <div className="space-y-2">
                <Label className="text-gray-300">Yahoo Ticker</Label>
                <Input value={form.yahoo_ticker} onChange={(e) => updateField("yahoo_ticker", e.target.value)} placeholder="PE500.PA" className={inputCls} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Libellé *</Label>
            <Input value={form.label} onChange={(e) => updateField("label", e.target.value)} placeholder={mode === "quoted" ? "Amundi PEA S&P 500" : "Fonds Euros Spirit"} className={inputCls} />
          </div>

          {mode === "quoted" && (
            <>
              <div className="space-y-2">
                <Label className="text-gray-300">ISIN</Label>
                <Input value={form.isin} onChange={(e) => updateField("isin", e.target.value)} placeholder="FR0011871128" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Quantité *</Label>
                  <Input type="number" step="any" value={form.quantity} onChange={(e) => updateField("quantity", e.target.value)} placeholder="293" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">PRU *</Label>
                  <Input type="number" step="any" value={form.pru} onChange={(e) => updateField("pru", e.target.value)} placeholder="48.50" className={inputCls} />
                </div>
              </div>
            </>
          )}

          {mode === "manual" && (
            <div className="space-y-2">
              <Label className="text-gray-300">Valeur actuelle *</Label>
              <Input type="number" step="any" value={form.manual_value} onChange={(e) => updateField("manual_value", e.target.value)} placeholder="5200" className={inputCls} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Classe d&apos;actifs *</Label>
              <Select value={form.scenario_key} onValueChange={(v) => v && updateField("scenario_key", v)}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#161b22] border-gray-700">
                  {scenarioOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-white hover:bg-[#1f2937]">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Devise</Label>
              <Select value={form.currency} onValueChange={(v) => v && updateField("currency", v)}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#161b22] border-gray-700">
                  <SelectItem value="EUR" className="text-white">EUR</SelectItem>
                  <SelectItem value="USD" className="text-white">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-gray-700 text-gray-300 hover:bg-[#161b22]">Annuler</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? "Enregistrement..." : isEdit ? "Modifier" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
