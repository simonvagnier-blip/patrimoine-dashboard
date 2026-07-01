"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ReconRow {
  symbol: string;
  db_qty: number | null;
  ibkr_qty: number | null;
  qty_match: boolean;
  db_pru: number | null;
  ibkr_cost_per_share: number | null;
  ibkr_value: number | null;
  currency: string;
}

interface Accrual {
  symbol: string;
  exDate: string | null;
  payDate: string | null;
  netAmount: number | null;
  currency: string;
}

interface Status {
  configured: boolean;
  last_sync: {
    at?: string;
    ok?: boolean;
    error?: string;
    imported?: { buys: number; sells: number; dividends: number; fees: number; interest: number };
    skipped_existing?: number;
    positions_created?: string[];
    warnings?: string[];
  } | null;
  reconciliation: { at: string | null; rows: ReconRow[] };
  dividend_accruals: Accrual[];
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** Intégration IBKR : setup, sync manuel, réconciliation, dividendes annoncés. */
export default function IbkrPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/ibkr/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/ibkr/sync", { method: "POST" });
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  if (loading) {
    return <div className="h-24 bg-[#0d1117] border border-gray-800 rounded-xl animate-pulse" aria-hidden="true" />;
  }
  if (!status) return null;

  // ── Non configuré : guide de branchement (5 min chez IBKR) ──
  if (!status.configured) {
    return (
      <Card className="bg-[#0d1117] border-gray-800">
        <CardHeader className="pb-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Import automatique</p>
          <CardTitle className="text-sm text-gray-200 font-medium">Connecter Interactive Brokers (gratuit, ~5 min)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-400 space-y-2 leading-relaxed">
          <p>Fini la saisie manuelle : trades (commissions incluses), dividendes nets et réconciliation importés chaque nuit via le Flex Web Service officiel.</p>
          <ol className="list-decimal list-inside space-y-1.5 text-[13px]">
            <li>Client Portal IBKR → <span className="text-gray-300">Performance &amp; Reports → Flex Queries</span> → nouvelle <span className="text-gray-300">Activity Flex Query</span> avec les sections : <span className="text-gray-300">Trades (Executions), Cash Transactions, Open Positions, Change in Dividend Accruals</span> · format de date <span className="text-gray-300">yyyyMMdd</span> · période <span className="text-gray-300">Last 7 Calendar Days</span> → note le <span className="text-emerald-400">Query ID</span></li>
            <li>Même page → <span className="text-gray-300">Flex Web Service Configuration</span> → active → génère le <span className="text-emerald-400">token</span> (durée : 1 an)</li>
            <li>Vercel → projet <span className="text-gray-300">patrimoine-dashboard-rr5g</span> → Settings → Environment Variables : <code className="text-emerald-400 bg-[#161b22] px-1 rounded">IBKR_FLEX_TOKEN</code> et <code className="text-emerald-400 bg-[#161b22] px-1 rounded">IBKR_FLEX_QUERY_ID</code> → redéploie</li>
          </ol>
          <p className="text-xs text-gray-500">Le token est en lecture seule (reporting uniquement — aucun ordre possible). Limite connue : l&apos;historique Flex couvre 365 j max ; ton journal existant reste la source pour l&apos;antérieur.</p>
        </CardContent>
      </Card>
    );
  }

  const ls = status.last_sync;
  const imp = ls?.imported;
  const mismatches = status.reconciliation.rows.filter((r) => !r.qty_match);

  return (
    <Card className="bg-[#0d1117] border-gray-800">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Import automatique</p>
            <CardTitle className="text-sm text-gray-200 font-medium">
              IBKR — dernier sync {fmtDate(ls?.at)}{" "}
              {ls?.ok ? <span className="text-emerald-400">✓</span> : ls?.error ? <span className="text-red-400" title={ls.error}>✗</span> : null}
            </CardTitle>
          </div>
          <Button size="sm" onClick={handleSync} disabled={syncing} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">
            {syncing ? "Synchronisation…" : "Synchroniser maintenant"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ls?.error && <p className="text-xs text-red-400">Erreur : {ls.error}</p>}
        {imp && (
          <p className="text-xs text-gray-400 font-[family-name:var(--font-jetbrains)]">
            Importés : {imp.buys} achats · {imp.sells} ventes · {imp.dividends} dividendes · {imp.fees} frais · {imp.interest} intérêts
            {typeof ls?.skipped_existing === "number" && ls.skipped_existing > 0 && ` · ${ls.skipped_existing} déjà connus`}
          </p>
        )}
        {(ls?.warnings ?? []).length > 0 && (
          <ul className="text-xs text-amber-400/90 space-y-0.5 list-disc list-inside">
            {ls!.warnings!.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        {/* Réconciliation Dashboard ↔ IBKR */}
        {status.reconciliation.rows.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5">
              Réconciliation broker{" "}
              {mismatches.length === 0 ? (
                <span className="text-emerald-400">— tout concorde ✓</span>
              ) : (
                <span className="text-amber-400">— {mismatches.length} écart{mismatches.length > 1 ? "s" : ""}</span>
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-[family-name:var(--font-jetbrains)] tabular-nums">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left font-normal py-1">Titre</th>
                    <th className="text-right font-normal">Qté ici</th>
                    <th className="text-right font-normal">Qté IBKR</th>
                    <th className="text-right font-normal">PRU ici</th>
                    <th className="text-right font-normal">PRU IBKR</th>
                    <th className="text-right font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {status.reconciliation.rows.map((r) => (
                    <tr key={r.symbol} className="border-t border-gray-800/60 text-gray-300">
                      <td className="py-1.5">{r.symbol}</td>
                      <td className="text-right">{r.db_qty ?? "—"}</td>
                      <td className="text-right">{r.ibkr_qty ?? "—"}</td>
                      <td className="text-right">{r.db_pru !== null ? r.db_pru.toFixed(2) : "—"}</td>
                      <td className="text-right">{r.ibkr_cost_per_share !== null ? r.ibkr_cost_per_share.toFixed(2) : "—"}</td>
                      <td className="text-right">{r.qty_match ? <span className="text-emerald-400">✓</span> : <span className="text-amber-400">✗</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Dividendes annoncés (accruals) */}
        {status.dividend_accruals.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Dividendes annoncés</p>
            <ul className="space-y-1">
              {status.dividend_accruals.map((a, i) => (
                <li key={i} className="flex items-center gap-3 text-xs text-gray-300 font-[family-name:var(--font-jetbrains)] tabular-nums">
                  <span className="w-14">{a.symbol}</span>
                  <span className="text-gray-500">ex {a.exDate ?? "—"}</span>
                  <span className="text-gray-500">paiement {a.payDate ?? "—"}</span>
                  <span className="ml-auto text-emerald-400">
                    {a.netAmount !== null ? `~${a.netAmount.toFixed(2)} ${a.currency === "USD" ? "$" : a.currency}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
