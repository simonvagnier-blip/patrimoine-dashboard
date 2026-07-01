"use client";

import { chainTwr, flowsFromOperations, type DailyValue } from "@/lib/twr";

interface Snapshot {
  date: string;
  total_value: number;
  /** JSON {envelope_id: value_eur} — sert à exclure les livrets du calcul. */
  details_json?: string | null;
}

interface OperationRow {
  date: string;
  type: string;
  amount: number;
  currency: string;
}

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

/** Couleur de cellule : rouge → vert, intensité saturée à ±5 %/mois. */
function cellStyle(pct: number): React.CSSProperties {
  const t = Math.max(-1, Math.min(1, pct / 5));
  const alpha = 0.12 + 0.38 * Math.abs(t);
  return {
    backgroundColor: t >= 0 ? `rgba(52, 211, 153, ${alpha})` : `rgba(248, 113, 113, ${alpha})`,
    color: t >= 0 ? "#34d399" : "#f87171",
  };
}

/**
 * Heatmap années × mois du TWR mensuel GLOBAL (apports neutralisés).
 * Calculée côté client depuis les snapshots quotidiens + le journal
 * d'opérations (déjà chargés par le dashboard — zéro fetch en plus).
 */
export default function MonthlyHeatmap({
  history,
  operations,
  eurUsd = 1.08,
  mgaEurRate = 4800,
  excludeEnvelopeIds = [],
}: {
  history: Snapshot[];
  operations: OperationRow[];
  eurUsd?: number;
  mgaEurRate?: number;
  /** Enveloppes exclues du TWR (livrets : leurs versements ne sont pas
   *  journalisés → toute édition de valeur serait lue comme de la perf.
   *  Vérifié sur données réelles : +80 k€ de livrets le 01/07 → +41 %/mois
   *  mensonger sans cette exclusion). */
  excludeEnvelopeIds?: string[];
}) {
  const excluded = new Set(excludeEnvelopeIds);
  const sorted = [...history]
    .filter((s) => Number.isFinite(s.total_value) && s.total_value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      if (excluded.size === 0 || !s.details_json) return { date: s.date, total_value: s.total_value };
      try {
        const details = JSON.parse(s.details_json) as Record<string, number>;
        let cut = 0;
        for (const id of excluded) {
          if (typeof details[id] === "number") cut += details[id];
        }
        return { date: s.date, total_value: s.total_value - cut };
      } catch {
        return { date: s.date, total_value: s.total_value };
      }
    })
    .filter((s) => s.total_value > 0);
  if (sorted.length < 10) return null;

  const convert = (amount: number, currency: string) =>
    currency === "USD" ? amount / eurUsd : currency === "MGA" ? amount / mgaEurRate : amount;

  // Regroupe les snapshots par mois, en gardant le DERNIER point du mois
  // précédent comme base de chaîne (sinon le 1er jour du mois serait perdu).
  const byMonth = new Map<string, DailyValue[]>();
  for (let i = 0; i < sorted.length; i++) {
    const ym = sorted[i].date.slice(0, 7);
    if (!byMonth.has(ym)) {
      byMonth.set(ym, i > 0 ? [{ date: sorted[i - 1].date, value: sorted[i - 1].total_value }] : []);
    }
    byMonth.get(ym)!.push({ date: sorted[i].date, value: sorted[i].total_value });
  }

  const cells = new Map<string, number>(); // "YYYY-MM" → pct
  for (const [ym, values] of byMonth) {
    if (values.length < 2) continue;
    const monthOps = operations.filter(
      (o) => o.date > values[0].date && o.date <= values[values.length - 1].date
    );
    const flows = flowsFromOperations(monthOps, convert);
    const r = chainTwr(values, flows);
    if (r.twr !== null) cells.set(ym, r.twr * 100);
  }
  if (cells.size === 0) return null;

  const years = [...new Set([...cells.keys()].map((k) => k.slice(0, 4)))].sort();
  const currentYm = new Date().toISOString().slice(0, 7);

  return (
    <div className="bg-[#11161f] border border-gray-800 rounded-lg px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400 mb-2">
        Perf mensuelle
        <span className="normal-case tracking-normal text-gray-500 ml-2">(TWR, apports neutralisés · hors livrets &amp; business)</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left text-[10px] text-gray-500 font-normal w-10"></th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="text-[10px] text-gray-500 font-normal text-center min-w-[44px]">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y}>
                <td className="text-[11px] text-gray-400 font-[family-name:var(--font-jetbrains)]">{y}</td>
                {MONTH_LABELS.map((_, mi) => {
                  const ym = `${y}-${String(mi + 1).padStart(2, "0")}`;
                  const pct = cells.get(ym);
                  if (pct === undefined) {
                    return <td key={ym} className="h-8 rounded-md bg-gray-800/20" />;
                  }
                  return (
                    <td
                      key={ym}
                      className="h-8 rounded-md text-center text-[11px] font-semibold font-[family-name:var(--font-jetbrains)] tabular-nums"
                      style={cellStyle(pct)}
                      title={`${MONTH_LABELS[mi]} ${y}${ym === currentYm ? " (en cours)" : ""} : ${pct >= 0 ? "+" : ""}${pct.toFixed(2)} %`}
                    >
                      {pct >= 0 ? "+" : ""}{pct.toFixed(1)}{ym === currentYm ? "…" : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
