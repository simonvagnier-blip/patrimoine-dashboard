"use client";

import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PositionRow {
  id: number;
  envelope_name: string;
  envelope_color: string;
  ticker: string;
  label: string;
  quantity: number | null;
  pru: number | null;
  current_price: number | null;
  currency: string;
  current_value: number;
  pnl: number | null;
  pnl_pct: number | null;
  weight: number;
  /** Variation intraday % (Yahoo changePercent) — null pour manual_value. */
  daily_change_pct?: number | null;
}

interface PositionTableProps {
  positions: PositionRow[];
  grandTotal: number;
  hideAmounts?: boolean;
}

type SortKey = "value" | "pnl" | "pnl_pct" | "day" | "weight" | "ticker";
type SortDir = "asc" | "desc";
type GainFilter = "all" | "winners" | "losers";

function formatEur(value: number, decimals = 0): string {
  return value.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: decimals });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-block text-[10px] ${active ? "text-white" : "text-gray-600"}`}>
      {active ? (dir === "desc" ? "▼" : "▲") : "▽"}
    </span>
  );
}

/** Position soldée : quantité à 0 (convention -SOLD, historique conservé). */
function isSold(pos: PositionRow): boolean {
  return pos.quantity === 0;
}

export default function PositionTable({ positions, grandTotal, hideAmounts = false }: PositionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [gainFilter, setGainFilter] = useState<GainFilter>("all");
  const [showSold, setShowSold] = useState(false);
  const mask = (s: string) => (hideAmounts ? "••••" : s);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // ── Pipeline : soldées à part → recherche → gagnantes/perdantes → tri ──
  const active = positions.filter((p) => !isSold(p));
  const sold = positions.filter(isSold);

  const q = search.trim().toLowerCase();
  const filtered = active.filter((p) => {
    if (q && !p.ticker.toLowerCase().includes(q) && !p.label.toLowerCase().includes(q)) return false;
    if (gainFilter === "winners") return (p.pnl ?? 0) > 0;
    if (gainFilter === "losers") return (p.pnl ?? 0) < 0;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "value": cmp = a.current_value - b.current_value; break;
      case "pnl": cmp = (a.pnl ?? 0) - (b.pnl ?? 0); break;
      case "pnl_pct": cmp = (a.pnl_pct ?? -Infinity) - (b.pnl_pct ?? -Infinity); break;
      case "day": cmp = (a.daily_change_pct ?? -Infinity) - (b.daily_change_pct ?? -Infinity); break;
      case "weight": cmp = a.weight - b.weight; break;
      case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const pnlColor = (pnl: number | null) =>
    pnl === null ? "text-gray-500" : pnl >= 0 ? "text-emerald-400" : "text-red-400";
  const dayColor = (v: number | null | undefined) =>
    v === null || v === undefined ? "text-gray-500" : v >= 0 ? "text-emerald-400" : "text-red-400";

  const gainOptions: Array<{ key: GainFilter; label: string }> = [
    { key: "all", label: "Toutes" },
    { key: "winners", label: "Gagnantes" },
    { key: "losers", label: "Perdantes" },
  ];

  return (
    <>
      {/* Barre de filtres : recherche + gagnantes/perdantes */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (ticker, libellé)…"
          aria-label="Rechercher une position"
          className="flex-1 min-w-[180px] max-w-[280px] bg-[#161b22] border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-500"
        />
        <div className="flex rounded-md bg-[#161b22] border border-gray-700 p-0.5">
          {gainOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setGainFilter(opt.key)}
              aria-pressed={gainFilter === opt.key}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                gainFilter === opt.key
                  ? opt.key === "losers"
                    ? "bg-red-500/15 text-red-400"
                    : opt.key === "winners"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {(q || gainFilter !== "all") && (
          <span className="text-xs text-gray-500">
            {sorted.length}/{active.length} position{active.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* R5: Mobile card view */}
      <div className="block sm:hidden space-y-3">
        {sorted.map((pos) => (
          <div key={pos.id} className="bg-[#161b22] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-[family-name:var(--font-jetbrains)] text-sm font-medium text-white">
                  {pos.ticker}
                </span>
                <Badge variant="outline" className="border-gray-700 text-[10px] px-1.5 py-0" style={{ color: pos.envelope_color }}>
                  {pos.envelope_name.split(" ")[0]}
                </Badge>
                {typeof pos.daily_change_pct === "number" && (
                  <span className={`text-[11px] font-[family-name:var(--font-jetbrains)] ${dayColor(pos.daily_change_pct)}`}>
                    {pos.daily_change_pct >= 0 ? "+" : ""}{pos.daily_change_pct.toFixed(1)}% 1j
                  </span>
                )}
              </div>
              <span className="font-[family-name:var(--font-jetbrains)] text-sm font-bold text-white tabular-nums">
                {mask(formatEur(pos.current_value))}
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate">{pos.label}</p>
            <div className="flex items-center justify-between text-xs">
              <div className="flex gap-3 text-gray-500">
                {pos.quantity !== null && <span>Qté: {pos.quantity.toLocaleString("fr-FR")}</span>}
                {pos.current_price !== null && (
                  <span>Cours: {mask(pos.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span>
                )}
              </div>
              <span className={`font-[family-name:var(--font-jetbrains)] ${pnlColor(pos.pnl)}`}>
                {pos.pnl !== null ? (
                  <>{hideAmounts ? "••••" : <>{pos.pnl >= 0 ? "+" : ""}{formatEur(pos.pnl)}</>}{pos.pnl_pct !== null ? " (" + (pos.pnl_pct >= 0 ? "+" : "") + pos.pnl_pct.toFixed(1) + "%)" : ""}</>
                ) : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-400">Enveloppe</TableHead>
              <TableHead className="text-gray-400 cursor-pointer select-none" onClick={() => toggleSort("ticker")}>
                Ticker <SortIcon active={sortKey === "ticker"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-gray-400">Libellé</TableHead>
              <TableHead className="text-gray-400 text-right">Qté</TableHead>
              <TableHead className="text-gray-400 text-right">PRU</TableHead>
              <TableHead className="text-gray-400 text-right">Cours</TableHead>
              <TableHead className="text-gray-400 text-right cursor-pointer select-none" onClick={() => toggleSort("day")}>
                1J <SortIcon active={sortKey === "day"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-gray-400 text-right cursor-pointer select-none" onClick={() => toggleSort("value")}>
                Valeur <SortIcon active={sortKey === "value"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-gray-400 text-right select-none whitespace-nowrap">
                <span className="cursor-pointer" onClick={() => toggleSort("pnl")}>
                  +/- € <SortIcon active={sortKey === "pnl"} dir={sortDir} />
                </span>
                <span className="cursor-pointer ml-1.5" onClick={() => toggleSort("pnl_pct")}>
                  % <SortIcon active={sortKey === "pnl_pct"} dir={sortDir} />
                </span>
              </TableHead>
              <TableHead className="text-gray-400 text-right cursor-pointer select-none" onClick={() => toggleSort("weight")}>
                Poids <SortIcon active={sortKey === "weight"} dir={sortDir} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((pos) => (
              <TableRow key={pos.id} className="border-gray-800 hover:bg-[#161b22]">
                <TableCell>
                  <Badge variant="outline" className="border-gray-700 text-xs" style={{ color: pos.envelope_color }}>
                    {pos.envelope_name}
                  </Badge>
                </TableCell>
                <TableCell className="font-[family-name:var(--font-jetbrains)] text-gray-300 text-sm">{pos.ticker}</TableCell>
                <TableCell className="text-gray-300 text-sm max-w-[200px] truncate">{pos.label}</TableCell>
                <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-gray-300 text-sm">
                  {pos.quantity !== null ? pos.quantity.toLocaleString("fr-FR") : "—"}
                </TableCell>
                <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-gray-300 text-sm tabular-nums">
                  {pos.pru !== null ? mask(pos.pru.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (pos.currency === "USD" ? " $" : " €")) : "—"}
                </TableCell>
                <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-gray-300 text-sm tabular-nums">
                  {pos.current_price !== null ? mask(pos.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (pos.currency === "USD" ? " $" : " €")) : "—"}
                </TableCell>
                <TableCell className={`text-right font-[family-name:var(--font-jetbrains)] text-sm tabular-nums ${dayColor(pos.daily_change_pct)}`}>
                  {typeof pos.daily_change_pct === "number"
                    ? `${pos.daily_change_pct >= 0 ? "+" : ""}${pos.daily_change_pct.toFixed(1)}%`
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-white font-medium text-sm tabular-nums">
                  {mask(formatEur(pos.current_value))}
                </TableCell>
                <TableCell className={`text-right font-[family-name:var(--font-jetbrains)] text-sm tabular-nums ${pnlColor(pos.pnl)}`}>
                  {pos.pnl !== null ? (
                    <>{hideAmounts ? "••••" : <>{pos.pnl >= 0 ? "+" : ""}{formatEur(pos.pnl)}</>}<span className="text-xs ml-1">({pos.pnl_pct !== null ? (pos.pnl_pct >= 0 ? "+" : "") + pos.pnl_pct.toFixed(1) + "%" : ""})</span></>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-gray-400 text-sm">
                  {grandTotal > 0 ? ((pos.current_value / grandTotal) * 100).toFixed(1) + "%" : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-6">Aucune position ne correspond aux filtres.</p>
      )}

      {/* Positions soldées : hors du tableau principal, repliées par défaut.
          L'historique reste en base (convention contre-passation) — ici on ne
          fait que désencombrer la vue. */}
      {sold.length > 0 && (
        <div className="mt-4 border-t border-gray-800 pt-3">
          <button
            onClick={() => setShowSold((v) => !v)}
            aria-expanded={showSold}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors py-2"
          >
            <span className={`inline-block transition-transform ${showSold ? "rotate-90" : ""}`}>▸</span>
            Positions soldées ({sold.length})
          </button>
          {showSold && (
            <div className="mt-1 space-y-1">
              {sold.map((pos) => (
                <div key={pos.id} className="flex items-center gap-3 px-2 py-1.5 rounded-md bg-[#161b22]/50 text-sm">
                  <Badge variant="outline" className="border-gray-700 text-[10px] px-1.5 py-0 shrink-0" style={{ color: pos.envelope_color }}>
                    {pos.envelope_name.split(" ")[0]}
                  </Badge>
                  <span className="font-[family-name:var(--font-jetbrains)] text-gray-400 shrink-0">{pos.ticker}</span>
                  <span className="text-gray-500 truncate">{pos.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
