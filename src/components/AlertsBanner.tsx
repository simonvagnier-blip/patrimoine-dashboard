"use client";

import { useEffect, useState } from "react";
import type { EvaluatedAlert } from "@/lib/alerts-types";

/**
 * Bandeau qui apparaît en haut du dashboard quand au moins une alerte est
 * actuellement déclenchée. Cliquable pour ouvrir un drawer (à venir),
 * dismissible (re-affichage à la prochaine évaluation triggering).
 */

export default function AlertsBanner() {
  const [triggered, setTriggered] = useState<EvaluatedAlert[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/alerts?evaluate=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.alerts) {
          setTriggered(d.alerts.filter((a: EvaluatedAlert) => a.triggered));
        }
      })
      .catch(() => {});
  }, []);

  if (dismissed || triggered.length === 0) return null;

  return (
    <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-amber-400 text-lg leading-none mt-0.5">🔔</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-amber-200 font-medium mb-1">
            {triggered.length} alerte{triggered.length > 1 ? "s" : ""} déclenchée
            {triggered.length > 1 ? "s" : ""}
          </p>
          <ul className="text-xs text-amber-100/80 space-y-0.5">
            {triggered.slice(0, 5).map((a) => (
              <li key={a.id} className="font-[family-name:var(--font-jetbrains)]">
                · {a.label}
                {a.current_value !== null && (
                  <span className="text-amber-200/60 ml-2">
                    actuel :{" "}
                    {a.unit === "€" || a.unit === "$"
                      ? a.current_value.toLocaleString("fr-FR", {
                          maximumFractionDigits: 2,
                        }) +
                        " " +
                        a.unit
                      : a.current_value.toFixed(2) + "%"}
                  </span>
                )}
              </li>
            ))}
            {triggered.length > 5 && (
              <li className="text-amber-200/60">
                + {triggered.length - 5} autre{triggered.length - 5 > 1 ? "s" : ""}
              </li>
            )}
          </ul>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400 hover:text-amber-200 text-lg leading-none flex-shrink-0"
        title="Masquer pour cette session"
      >
        ×
      </button>
    </div>
  );
}
