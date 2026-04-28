"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ALERT_LABELS, type EvaluatedAlert, type AlertType } from "@/lib/alerts-types";
import ConfirmDialog from "@/components/ConfirmDialog";

/**
 * Mini-CRUD d'alertes affiché dans le panneau étendu d'une position.
 * Liste les alertes existantes avec leur état (triggered/dormant) et
 * permet d'en créer / supprimer.
 *
 * Volontairement compact : type + threshold dans une seule ligne, pas de
 * dialog modal pour rester fluide.
 */

const POSITION_ALERT_TYPES: { value: AlertType; label: string; suffix: string }[] = [
  { value: "price_above", label: "Cours >", suffix: "(devise position)" },
  { value: "price_below", label: "Cours <", suffix: "(devise position)" },
  { value: "pnl_pct_above", label: "P&L % >", suffix: "%" },
  { value: "pnl_pct_below", label: "P&L % <", suffix: "%" },
  { value: "weight_above", label: "Poids portef. >", suffix: "%" },
];

export default function PositionAlerts({
  positionId,
  positionTicker,
  positionCurrency,
  onChange,
}: {
  positionId: number;
  positionTicker: string;
  positionCurrency: string;
  onChange?: () => void;
}) {
  const [alerts, setAlerts] = useState<EvaluatedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<AlertType>("price_above");
  const [newThreshold, setNewThreshold] = useState("");
  const [toDelete, setToDelete] = useState<number | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/alerts?evaluate=true&position_id=${positionId}`
      );
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const threshold = parseFloat(newThreshold);
    if (isNaN(threshold)) return;
    setAdding(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newType,
          threshold,
          position_id: positionId,
        }),
      });
      if (res.ok) {
        setNewThreshold("");
        await reload();
        onChange?.();
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (toDelete === null) return;
    const res = await fetch(`/api/alerts?id=${toDelete}`, { method: "DELETE" });
    if (res.ok) {
      await reload();
      onChange?.();
    }
    setToDelete(null);
  }

  return (
    <div className="space-y-2 mt-2">
      <h4 className="text-xs uppercase text-gray-500 font-medium">
        Alertes de seuil
      </h4>

      {!loading && alerts.length === 0 && (
        <p className="text-xs text-gray-600">Aucune alerte configurée.</p>
      )}

      {alerts.length > 0 && (
        <ul className="space-y-1">
          {alerts.map((a) => (
            <li
              key={a.id}
              className={`flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-md ${
                a.triggered
                  ? "bg-amber-900/20 border border-amber-700/40"
                  : "bg-gray-900/40 border border-gray-800"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={a.triggered ? "text-amber-400" : "text-gray-600"}
                >
                  {a.triggered ? "🔔" : "·"}
                </span>
                <span className="font-[family-name:var(--font-jetbrains)] text-gray-300">
                  {ALERT_LABELS[a.type]}{" "}
                  <span className={a.triggered ? "text-amber-200" : "text-gray-400"}>
                    {a.threshold}
                    {a.unit === "€" || a.unit === "$" ? " " + a.unit : "%"}
                  </span>
                </span>
                {a.current_value !== null && (
                  <span className="text-gray-500 font-[family-name:var(--font-jetbrains)]">
                    · actuel{" "}
                    {a.unit === "€" || a.unit === "$"
                      ? a.current_value.toFixed(2) + " " + a.unit
                      : a.current_value.toFixed(2) + "%"}
                  </span>
                )}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setToDelete(a.id);
                }}
                className="text-gray-600 hover:text-red-400 text-base leading-none flex-shrink-0"
                title="Supprimer"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Formulaire d'ajout */}
      <form
        onSubmit={handleAdd}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 pt-1"
      >
        <Select
          value={newType}
          onValueChange={(v) => v && setNewType(v as AlertType)}
        >
          <SelectTrigger className="bg-[#161b22] border-gray-800 text-white text-xs h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#161b22] border-gray-800 text-white">
            {POSITION_ALERT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          step="any"
          value={newThreshold}
          onChange={(e) => setNewThreshold(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder={
            newType === "price_above" || newType === "price_below"
              ? `seuil ${positionCurrency === "USD" ? "$" : "€"}`
              : "seuil %"
          }
          className="bg-[#161b22] border-gray-800 text-white text-xs h-8 flex-1 max-w-[120px]"
          required
        />
        <Button
          type="submit"
          size="sm"
          disabled={adding || !newThreshold}
          className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          + Alerte
        </Button>
      </form>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        title="Supprimer cette alerte ?"
        description="L'alerte sera définitivement retirée de la position."
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
