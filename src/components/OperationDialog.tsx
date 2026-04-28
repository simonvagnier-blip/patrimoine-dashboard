"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Catalogue des types d'opération avec leur "sign convention" pour le montant :
 *   sign = "cash_out"  → l'utilisateur met de l'argent sur l'enveloppe (versement, achat, frais)
 *                        L'utilisateur saisit un montant positif, stocké tel quel (positif).
 *   sign = "cash_in"   → l'enveloppe rend de l'argent (vente, retrait, dividende, intérêt)
 *                        L'utilisateur saisit un montant positif, stocké NÉGATIF en DB.
 * Cette convention prépare le calcul xirr du Lot 1b :
 *   xirr attend des cashflows du point de vue de l'investisseur, donc :
 *     deposits/buys → CF négatifs ; sells/withdrawals/dividends → CF positifs.
 *   On stocke donc `amount` déjà signé côté investisseur.
 */
const OPERATION_TYPES: Array<{
  value: string;
  label: string;
  icon: string;
  sign: "cash_out" | "cash_in";
  usesQty: boolean;
}> = [
  { value: "deposit", label: "Versement", icon: "→", sign: "cash_out", usesQty: false },
  { value: "buy", label: "Achat", icon: "+", sign: "cash_out", usesQty: true },
  { value: "sell", label: "Vente", icon: "−", sign: "cash_in", usesQty: true },
  { value: "dividend", label: "Dividende", icon: "€", sign: "cash_in", usesQty: false },
  { value: "interest", label: "Intérêt", icon: "%", sign: "cash_in", usesQty: false },
  { value: "withdrawal", label: "Retrait", icon: "←", sign: "cash_in", usesQty: false },
  { value: "fee", label: "Frais", icon: "!", sign: "cash_out", usesQty: false },
  { value: "transfer", label: "Transfert", icon: "⇆", sign: "cash_out", usesQty: false },
];

export interface OperationFormData {
  id?: number;
  envelope_id: string;
  position_id: number | null;
  date: string;
  type: string;
  quantity: string;
  unit_price: string;
  amount: string;
  currency: string;
  note: string;
}

export interface Operation {
  id: number;
  envelope_id: string;
  position_id: number | null;
  date: string;
  type: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  currency: string;
  note: string | null;
}

interface PositionOption {
  id: number;
  ticker: string;
  label: string;
  currency: string;
}

interface OperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envelopeId: string;
  positions: PositionOption[];
  editOperation?: Operation | null;
  onSaved: () => void;
}

function todayYmd(): string {
  return new Date().toISOString().split("T")[0];
}

export default function OperationDialog({
  open,
  onOpenChange,
  envelopeId,
  positions,
  editOperation,
  onSaved,
}: OperationDialogProps) {
  const [form, setForm] = useState<OperationFormData>({
    envelope_id: envelopeId,
    position_id: null,
    date: todayYmd(),
    type: "deposit",
    quantity: "",
    unit_price: "",
    amount: "",
    currency: "EUR",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (editOperation) {
      // Pour l'édition on réaffiche le montant en valeur ABSOLUE (l'utilisateur
      // saisit toujours un montant positif, le signe est géré par le type).
      setForm({
        id: editOperation.id,
        envelope_id: editOperation.envelope_id,
        position_id: editOperation.position_id,
        date: editOperation.date,
        type: editOperation.type,
        quantity: editOperation.quantity?.toString() ?? "",
        unit_price: editOperation.unit_price?.toString() ?? "",
        amount: Math.abs(editOperation.amount).toString(),
        currency: editOperation.currency,
        note: editOperation.note ?? "",
      });
    } else {
      setForm((prev) => ({
        ...prev,
        envelope_id: envelopeId,
        position_id: null,
        date: todayYmd(),
        type: "deposit",
        quantity: "",
        unit_price: "",
        amount: "",
        note: "",
      }));
    }
    setError(null);
  }, [editOperation, envelopeId, open]);

  const typeConfig = useMemo(
    () => OPERATION_TYPES.find((t) => t.value === form.type) ?? OPERATION_TYPES[0],
    [form.type]
  );

  // Pour les achats/ventes, on auto-calcule le montant = qty × unit_price.
  useEffect(() => {
    if (!typeConfig.usesQty) return;
    const q = parseFloat(form.quantity);
    const p = parseFloat(form.unit_price);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
      setForm((prev) => ({
        ...prev,
        amount: (q * p).toFixed(2),
      }));
    }
  }, [form.quantity, form.unit_price, typeConfig.usesQty]);

  function update<K extends keyof OperationFormData>(
    key: K,
    value: OperationFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const absAmount = parseFloat(form.amount);
    if (isNaN(absAmount) || absAmount <= 0) {
      setError("Le montant doit être un nombre positif");
      return;
    }
    if (!form.date) {
      setError("La date est requise");
      return;
    }

    // Signe selon le type
    const signedAmount =
      typeConfig.sign === "cash_out" ? absAmount : -absAmount;

    setSaving(true);
    try {
      const payload = {
        id: form.id,
        envelope_id: form.envelope_id,
        position_id: form.position_id,
        date: form.date,
        type: form.type,
        quantity: typeConfig.usesQty && form.quantity ? parseFloat(form.quantity) : null,
        unit_price: typeConfig.usesQty && form.unit_price ? parseFloat(form.unit_price) : null,
        amount: signedAmount,
        currency: form.currency,
        note: form.note.trim() || null,
      };

      const res = await fetch("/api/operations", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!form.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/operations?id=${form.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
      setDeleteConfirmOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1117] border-gray-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Modifier l'opération" : "Nouvelle opération"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div className="space-y-2">
            <Label className="text-gray-300">Type</Label>
            <div className="grid grid-cols-4 gap-1">
              {OPERATION_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update("type", t.value)}
                  className={`px-2 py-2 text-xs rounded-md border transition-colors ${
                    form.type === t.value
                      ? "bg-emerald-600/20 border-emerald-500 text-white"
                      : "bg-[#161b22] border-gray-800 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  <span className="block text-base leading-none mb-0.5">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              {typeConfig.sign === "cash_out"
                ? "Argent qui entre dans l'enveloppe"
                : "Argent qui sort de l'enveloppe"}
            </p>
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-gray-300">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                className="bg-[#161b22] border-gray-800 text-white"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300">Devise</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => {
                  if (v) update("currency", v);
                }}
              >
                <SelectTrigger className="bg-[#161b22] border-gray-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161b22] border-gray-800 text-white">
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Position (optionnelle, utile pour achat/vente/dividende) */}
          {(typeConfig.usesQty || form.type === "dividend") && positions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-gray-300">Position (optionnel)</Label>
              <Select
                value={form.position_id?.toString() ?? "none"}
                onValueChange={(v) => {
                  if (!v) return;
                  const newPositionId: number | null =
                    v === "none" ? null : parseInt(v);
                  setForm((prev) => ({ ...prev, position_id: newPositionId }));
                }}
              >
                <SelectTrigger className="bg-[#161b22] border-gray-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161b22] border-gray-800 text-white">
                  <SelectItem value="none">— Aucune —</SelectItem>
                  {positions.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.ticker} — {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quantity & unit price (achat/vente) */}
          {typeConfig.usesQty && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-300">Quantité</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => update("quantity", e.target.value)}
                  className="bg-[#161b22] border-gray-800 text-white"
                  placeholder="10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300">Prix unitaire</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.unit_price}
                  onChange={(e) => update("unit_price", e.target.value)}
                  className="bg-[#161b22] border-gray-800 text-white"
                  placeholder="48.50"
                />
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-gray-300">
              Montant{" "}
              <span className="text-gray-500 text-xs font-normal">
                ({typeConfig.usesQty ? "auto-calculé" : "positif"})
              </span>
            </Label>
            <Input
              type="number"
              step="any"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
              className="bg-[#161b22] border-gray-800 text-white font-[family-name:var(--font-jetbrains)]"
              required
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-gray-300">Note (optionnel)</Label>
            <Input
              type="text"
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              className="bg-[#161b22] border-gray-800 text-white"
              placeholder="Rééquilibrage, virement Fortuneo, etc."
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-900 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {form.id ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={saving}
                className="border-red-900 text-red-400 hover:bg-red-900/20"
              >
                Supprimer
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="border-gray-700 text-gray-300"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? "..." : form.id ? "Enregistrer" : "Ajouter"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Supprimer cette opération ?"
        description="L'opération sera définitivement retirée du journal. Le TRI et les agrégats seront recalculés."
        onConfirm={handleDeleteConfirmed}
      />
    </Dialog>
  );
}
