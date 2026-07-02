"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ImportSummary {
  mode: string;
  parsed: number;
  skipped_dup: number;
  by_year: Record<string, { n: number; inc: number; exp: number }>;
  by_category: Array<{ category: string; n: number; sum: number }>;
  inserted: number;
  wiped?: number;
}

/**
 * Import in-app des CSV Fortuneo (C7) : dépose les 2 exports, prévisualise le
 * découpage, puis insère (ajout ou remplacement complet). Portage du CLI
 * scripts/import-fortuneo-csv.mjs — plus besoin du terminal.
 */
export default function BudgetImportPanel({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [cbCsv, setCbCsv] = useState("");
  const [releveCsv, setReleveCsv] = useState("");
  const [cbName, setCbName] = useState("");
  const [releveName, setReleveName] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function readFile(file: File, which: "cb" | "releve") {
    const text = await file.text();
    if (which === "cb") { setCbCsv(text); setCbName(file.name); }
    else { setReleveCsv(text); setReleveName(file.name); }
    setSummary(null);
  }

  async function run(mode: "preview" | "insert" | "wipe") {
    if (!cbCsv && !releveCsv) { setError("Dépose au moins un fichier CSV."); return; }
    if (mode === "wipe" && !confirm("Remplacer TOUT le budget par ces fichiers ? Les entrées actuelles seront supprimées.")) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/budget/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cbCsv, releveCsv, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'import");
      setSummary(data);
      if (mode !== "preview") onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-[#11161f] border-gray-800">
      <CardHeader className="pb-2">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center justify-between w-full text-left"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Import</p>
            <CardTitle className="text-sm text-gray-200 font-medium">Importer des relevés Fortuneo (CSV)</CardTitle>
          </div>
          <span className={`text-gray-500 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            Fortuneo → Compte → Historique → Télécharger. Dépose « Dépense CB » et/ou « Relevé de compte ».
            La catégorisation (règles + vendeurs + tes règles persistées) est appliquée automatiquement.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs text-gray-400">
              Dépense CB
              <input
                type="file" accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], "cb")}
                className="text-xs text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#161b22] file:text-gray-300 file:cursor-pointer"
              />
              {cbName && <span className="text-emerald-400">✓ {cbName}</span>}
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-gray-400">
              Relevé de compte
              <input
                type="file" accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], "releve")}
                className="text-xs text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#161b22] file:text-gray-300 file:cursor-pointer"
              />
              {releveName && <span className="text-emerald-400">✓ {releveName}</span>}
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("preview")} className="border-gray-700 text-gray-300 hover:bg-[#161b22]">
              {busy ? "…" : "Prévisualiser"}
            </Button>
            <Button size="sm" disabled={busy || !summary} onClick={() => run("insert")} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">
              Ajouter {summary ? `(${summary.parsed})` : ""}
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !summary} onClick={() => run("wipe")} className="border-red-800/60 text-red-400 hover:bg-red-900/20">
              Remplacer tout
            </Button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {summary && (
            <div className="border-t border-gray-800 pt-3 space-y-2 text-xs">
              {summary.inserted > 0 ? (
                <p className="text-emerald-400">
                  ✓ {summary.inserted} lignes importées{summary.wiped ? ` (${summary.wiped} remplacées)` : ""}.
                </p>
              ) : (
                <p className="text-gray-400">
                  Aperçu : {summary.parsed} transactions ({summary.skipped_dup} doublons CB filtrés).
                </p>
              )}
              <div className="font-[family-name:var(--font-jetbrains)] tabular-nums text-gray-400 space-y-0.5">
                {Object.entries(summary.by_year).sort().map(([y, s]) => (
                  <div key={y}>
                    {y} — {s.n} ops · revenu {Math.round(s.inc).toLocaleString("fr-FR")} € · dépense {Math.round(s.exp).toLocaleString("fr-FR")} €
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {summary.by_category.slice(0, 8).map((c) => (
                  <span key={c.category} className="px-2 py-0.5 rounded-full bg-[#161b22] text-gray-400 text-[11px]">
                    {c.category} {Math.round(c.sum).toLocaleString("fr-FR")} €
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
