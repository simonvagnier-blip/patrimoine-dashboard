"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import OperationDialog, { type Operation } from "@/components/OperationDialog";

const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  deposit: { label: "Versement", icon: "→", color: "text-emerald-400" },
  buy: { label: "Achat", icon: "+", color: "text-emerald-400" },
  sell: { label: "Vente", icon: "−", color: "text-amber-400" },
  dividend: { label: "Dividende", icon: "€", color: "text-sky-400" },
  interest: { label: "Intérêt", icon: "%", color: "text-sky-400" },
  withdrawal: { label: "Retrait", icon: "←", color: "text-red-400" },
  fee: { label: "Frais", icon: "!", color: "text-red-400" },
  transfer: { label: "Transfert", icon: "⇆", color: "text-gray-400" },
};

function formatEur(v: number, d = 2): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
}

function formatAmount(v: number, currency: string, d = 2): string {
  if (currency === "USD") {
    return (
      v.toLocaleString("fr-FR", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      }) + " $"
    );
  }
  return formatEur(v, d);
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface PositionOption {
  id: number;
  ticker: string;
  label: string;
  currency: string;
}

export default function OperationsTimeline({
  envelopeId,
  positions,
}: {
  envelopeId: string;
  positions: PositionOption[];
}) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Operation | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/operations?envelope_id=${encodeURIComponent(envelopeId)}&order=desc`
      );
      if (res.ok) setOperations(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopeId]);

  const positionById = new Map(positions.map((p) => [p.id, p]));

  // Agrégats rapides pour le header de la section
  const totalDeposits = operations
    .filter((o) => o.type === "deposit")
    .reduce((s, o) => s + Math.abs(o.amount), 0);
  const totalDividends = operations
    .filter((o) => o.type === "dividend" || o.type === "interest")
    .reduce((s, o) => s + Math.abs(o.amount), 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h3 className="text-white font-medium">
            Journal d&apos;opérations{" "}
            <span className="text-sm font-normal text-gray-400 ml-1">
              ({operations.length})
            </span>
          </h3>
          {operations.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-gray-500 font-[family-name:var(--font-jetbrains)]">
              {totalDeposits > 0 && (
                <span>
                  Versé :{" "}
                  <span className="text-emerald-400">
                    {formatEur(totalDeposits, 0)}
                  </span>
                </span>
              )}
              {totalDividends > 0 && (
                <span>
                  Dividendes+intérêts :{" "}
                  <span className="text-sky-400">
                    {formatEur(totalDividends, 0)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          + Opération
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="h-24 bg-gray-800/30 rounded-lg animate-pulse" />
      ) : operations.length === 0 ? (
        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-6 text-center text-sm text-gray-500">
          Aucune opération enregistrée pour cette enveloppe. Les opérations te
          permettent de calculer le vrai TRI et de suivre tes dividendes,
          versements et arbitrages.
        </div>
      ) : (
        <div className="bg-[#0d1117] border border-gray-800 rounded-lg divide-y divide-gray-800 overflow-hidden">
          {operations.map((op) => {
            const meta = TYPE_META[op.type] ?? TYPE_META.transfer;
            const position = op.position_id ? positionById.get(op.position_id) : null;
            const absAmount = Math.abs(op.amount);
            return (
              <button
                key={op.id}
                onClick={() => {
                  setEditing(op);
                  setDialogOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-900/40 transition-colors text-left"
              >
                <span
                  className={`flex-shrink-0 w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-sm ${meta.color}`}
                >
                  {meta.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="text-white">{meta.label}</span>
                    {position && (
                      <span className="text-gray-500 text-xs">
                        {position.ticker} · {position.label}
                      </span>
                    )}
                    {op.quantity && op.unit_price && (
                      <span className="text-gray-600 text-xs font-[family-name:var(--font-jetbrains)]">
                        {op.quantity} × {op.unit_price}
                      </span>
                    )}
                  </div>
                  {op.note && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {op.note}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p
                    className={`text-sm font-[family-name:var(--font-jetbrains)] ${meta.color}`}
                  >
                    {formatAmount(absAmount, op.currency)}
                  </p>
                  <p className="text-[11px] text-gray-600">{formatDate(op.date)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <OperationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        envelopeId={envelopeId}
        positions={positions}
        editOperation={editing}
        onSaved={reload}
      />
    </div>
  );
}
