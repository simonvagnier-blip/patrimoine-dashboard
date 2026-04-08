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
}

interface PositionTableProps {
  positions: PositionRow[];
  grandTotal: number;
}

type SortKey = "value" | "pnl" | "weight" | "ticker";
type SortDir = "asc" | "desc";

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

export default function PositionTable({ positions, grandTotal }: PositionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...positions].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "value": cmp = a.current_value - b.current_value; break;
      case "pnl": cmp = (a.pnl ?? 0) - (b.pnl ?? 0); break;
      case "weight": cmp = a.weight - b.weight; break;
      case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const pnlColor = (pnl: number | null) =>
    pnl === null ? "text-gray-500" : pnl >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <>
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
              </div>
              <span className="font-[family-name:var(--font-jetbrains)] text-sm font-bold text-white">
                {formatEur(pos.current_value)}
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate">{pos.label}</p>
            <div className="flex items-center justify-between text-xs">
              <div className="flex gap-3 text-gray-500">
                {pos.quantity !== null && <span>Qté: {pos.quantity.toLocaleString("fr-FR")}</span>}
                {pos.current_price !== null && (
                  <span>Cours: {pos.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
              </div>
              <span className={`font-[family-name:var(--font-jetbrains)] ${pnlColor(pos.pnl)}`}>
                {pos.pnl !== null ? (
                  <>{pos.pnl >= 0 ? "+" : ""}{formatEur(pos.pnl)} ({pos.pnl_pct !== null ? (pos.pnl_pct >= 0 ? "+" : "") + pos.pnl_pct.toFixed(1) + "%" : ""})</>
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
              <TableHead className="text-gray-400 text-right cursor-pointer select-none" onClick={() => toggleSort("value")}>
                Valeur <SortIcon active={sortKey === "value"} dir={sortDir} />
              </TableHead>
              <TableHead className="text-gray-400 text-right cursor-pointer select-none" onClick={() => toggleSort("pnl")}>
                +/- value <SortIcon active={sortKey === "pnl"} dir={sortDir} />
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
                <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-gray-300 text-sm">
                  {pos.pru !== null ? pos.pru.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (pos.currency === "USD" ? " $" : " €") : "—"}
                </TableCell>
                <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-gray-300 text-sm">
                  {pos.current_price !== null ? pos.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (pos.currency === "USD" ? " $" : " €") : "—"}
                </TableCell>
                <TableCell className="text-right font-[family-name:var(--font-jetbrains)] text-white font-medium text-sm">
                  {formatEur(pos.current_value)}
                </TableCell>
                <TableCell className={`text-right font-[family-name:var(--font-jetbrains)] text-sm ${pnlColor(pos.pnl)}`}>
                  {pos.pnl !== null ? (
                    <>{pos.pnl >= 0 ? "+" : ""}{formatEur(pos.pnl)}<span className="text-xs ml-1">({pos.pnl_pct !== null ? (pos.pnl_pct >= 0 ? "+" : "") + pos.pnl_pct.toFixed(1) + "%" : ""})</span></>
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
    </>
  );
}
