"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FeeBreakdown {
  envelope_id: string;
  envelope_name: string;
  explicit_fees_eur: number;
  commissions_eur: number;
  total_eur: number;
  by_year: Record<string, number>;
}

interface FeesResult {
  total_eur: number;
  by_year: Record<string, number>;
  envelopes: FeeBreakdown[];
}

function eur(v: number): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

/**
 * Frais cumulés par enveloppe (C7) — frais de gestion explicites + commissions
 * de courtage incluses dans les achats/ventes. Rend visible ce qui ronge la
 * performance. N'apparaît que s'il y a des frais tracés.
 */
export default function FeesPanel({ hideAmounts = false }: { hideAmounts?: boolean }) {
  const [data, setData] = useState<FeesResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fees")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-28 bg-[#11161f] border border-gray-800 rounded-xl animate-pulse" aria-hidden="true" />;
  }
  if (!data || data.total_eur <= 0) return null;

  const years = [...new Set(data.envelopes.flatMap((e) => Object.keys(e.by_year)))].sort();
  const m = (s: string) => (hideAmounts ? "•••" : s);

  return (
    <Card className="bg-[#11161f] border-gray-800">
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Coûts</p>
            <CardTitle className="text-sm text-gray-200 font-medium">Frais cumulés</CardTitle>
          </div>
          <span className="font-[family-name:var(--font-jetbrains)] tabular-nums text-lg font-bold text-amber-400">
            {m(eur(data.total_eur))}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-[family-name:var(--font-jetbrains)] tabular-nums">
            <thead>
              <tr className="text-gray-500 text-xs">
                <th className="text-left font-normal py-1">Enveloppe</th>
                <th className="text-right font-normal">Gestion</th>
                <th className="text-right font-normal">Courtage</th>
                {years.map((y) => (
                  <th key={y} className="text-right font-normal">{y}</th>
                ))}
                <th className="text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.envelopes.map((e) => (
                <tr key={e.envelope_id} className="border-t border-gray-800/60 text-gray-300">
                  <td className="py-1.5">{e.envelope_name}</td>
                  <td className="text-right text-gray-400">{e.explicit_fees_eur > 0 ? m(eur(e.explicit_fees_eur)) : "—"}</td>
                  <td className="text-right text-gray-400">{e.commissions_eur > 0 ? m(eur(e.commissions_eur)) : "—"}</td>
                  {years.map((y) => (
                    <td key={y} className="text-right text-gray-500">{e.by_year[y] ? m(eur(e.by_year[y])) : "—"}</td>
                  ))}
                  <td className="text-right font-semibold text-amber-400">{m(eur(e.total_eur))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          Frais de gestion saisis (AV/PER) + commissions de courtage incluses dans tes PRU. Les frais de
          gestion en unités de compte non journalisés ne sont pas comptés ici.
        </p>
      </CardContent>
    </Card>
  );
}
