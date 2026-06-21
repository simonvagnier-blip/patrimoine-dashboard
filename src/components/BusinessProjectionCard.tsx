"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RTooltip,
  ReferenceLine,
} from "recharts";
import { DEAL_RULES } from "@/lib/business-deals";

interface BusinessPosition {
  id: number;
  ticker: string;
  label: string;
  value: number; // en EUR (déjà converti)
  manual_value: number | null;
  currency: string;
}

interface BusinessEnvelope {
  id: string;
  name: string;
  type: string;
  color: string;
}

/**
 * Carte de projection des bénéfices attendus pour une enveloppe "business".
 * Les règles de deal (DEAL_RULES) sont désormais dans @/lib/business-deals
 * (source unique partagée avec les alertes d'échéance).
 */

function formatEur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: d });
}

/** Format MGA — pas de symbole automatique côté Intl, on append manuellement. */
function formatMga(v: number): string {
  return `${Math.round(v).toLocaleString("fr-FR")} MGA`;
}

interface MonthlyCashflow {
  month: string; // YYYY-MM
  monthLabel: string; // ex: "Mai"
  income: number; // bénéfices encaissés ce mois (EUR)
  capital_returned: number; // capital remboursé ce mois (EUR)
  details: Array<{ source: string; income: number; capital: number }>;
}

function projectCashflows(
  positions: BusinessPosition[],
  monthsHorizon = 12,
): MonthlyCashflow[] {
  const now = new Date();
  const months: MonthlyCashflow[] = [];
  // Démarre au MOIS COURANT (i=0) : la mensualité de ce mois-ci (ex: intérêts
  // du 21) n'a pas encore été nécessairement versée, elle doit figurer dans la
  // projection. Avant on démarrait à i=1 → le mois en cours était zappé.
  for (let i = 0; i < monthsHorizon; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      month: ym,
      monthLabel: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
      income: 0,
      capital_returned: 0,
      details: [],
    });
  }

  for (const pos of positions) {
    const rule = DEAL_RULES[pos.ticker];
    if (!rule) continue;
    const capitalEur = pos.value; // déjà converti EUR

    if (rule.type === "loan" && rule.monthly_yield_pct && rule.my_share_pct) {
      const monthlyIncome =
        (capitalEur * rule.monthly_yield_pct) / 100 * (rule.my_share_pct / 100);
      const exit = rule.exit_date ?? "9999-12-31";
      for (const m of months) {
        if (m.month <= exit.slice(0, 7)) {
          m.income += monthlyIncome;
          m.details.push({ source: pos.label, income: monthlyIncome, capital: 0 });
        }
        // Capital remboursé au mois d'exit
        if (m.month === exit.slice(0, 7)) {
          m.capital_returned += capitalEur;
          m.details.push({ source: pos.label + " (capital)", income: 0, capital: capitalEur });
        }
      }
    } else if (rule.type === "one_shot" && rule.exit_multiple && rule.my_share_pct) {
      const totalProfit = capitalEur * (rule.exit_multiple - 1) * (rule.my_share_pct / 100);
      const exit = rule.exit_date ?? "9999-12-31";
      const exitMonth = exit.slice(0, 7);
      for (const m of months) {
        if (m.month === exitMonth) {
          m.income += totalProfit;
          m.capital_returned += capitalEur;
          m.details.push({ source: pos.label, income: totalProfit, capital: capitalEur });
        }
      }
    }
    // type cash : pas de flux projeté
  }

  return months;
}

export default function BusinessProjectionCard({
  positions,
  envelope,
  mgaEurRate,
}: {
  positions: BusinessPosition[];
  envelope: BusinessEnvelope;
  /** Taux MGA pour 1 EUR (ex: 4846). Optionnel — si fourni, on affiche les
   *  montants en MGA sous chaque valeur EUR pour la lisibilité côté terrain. */
  mgaEurRate?: number;
}) {
  const cashflows = projectCashflows(positions);
  const totalIncome = cashflows.reduce((s, m) => s + m.income, 0);
  const totalCapitalReturned = cashflows.reduce((s, m) => s + m.capital_returned, 0);
  const currentCapital = positions.reduce((s, p) => s + p.value, 0);

  // Construit la courbe cumulative pour le graph
  let cumulative = 0;
  const chartData = cashflows.map((m) => {
    cumulative += m.income;
    return {
      month: m.monthLabel,
      cumul: Math.round(cumulative),
      mensuel: Math.round(m.income),
    };
  });

  // Mois avec un flux significatif (pour la table)
  const significantMonths = cashflows.filter((m) => m.income > 0.01 || m.capital_returned > 0.01);

  return (
    <Card className="bg-[#0d1117] border-gray-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <span>📈 Bénéfices attendus (12 mois)</span>
          <span className="text-sm font-normal text-gray-500">— projection sur règles par deal</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 3 KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#161b22] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Capital actuel
            </p>
            <p className="font-[family-name:var(--font-jetbrains)] text-xl font-bold text-white">
              {formatEur(currentCapital)}
            </p>
            {mgaEurRate && (
              <p className="text-[10px] text-gray-500 font-[family-name:var(--font-jetbrains)] mt-0.5">
                {formatMga(currentCapital * mgaEurRate)}
              </p>
            )}
          </div>
          <div className="bg-[#161b22] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Bénéfices attendus
            </p>
            <p className="font-[family-name:var(--font-jetbrains)] text-xl font-bold text-emerald-400">
              +{formatEur(totalIncome)}
            </p>
            {mgaEurRate && (
              <p className="text-[10px] text-emerald-400/60 font-[family-name:var(--font-jetbrains)] mt-0.5">
                +{formatMga(totalIncome * mgaEurRate)}
              </p>
            )}
          </div>
          <div className="bg-[#161b22] rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Capital remboursé à terme
            </p>
            <p className="font-[family-name:var(--font-jetbrains)] text-xl font-bold text-sky-400">
              {formatEur(totalCapitalReturned)}
            </p>
            {mgaEurRate && (
              <p className="text-[10px] text-sky-400/60 font-[family-name:var(--font-jetbrains)] mt-0.5">
                {formatMga(totalCapitalReturned * mgaEurRate)}
              </p>
            )}
          </div>
        </div>

        {/* Courbe cumul */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis
                dataKey="month"
                stroke="#6b7280"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#374151" }}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={11}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={{ stroke: "#374151" }}
              />
              <RTooltip
                contentStyle={{
                  backgroundColor: "#161b22",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(v, key) => [
                  formatEur(Number(v)),
                  String(key) === "cumul" ? "Cumul bénéfices" : "Mensuel",
                ]}
              />
              <ReferenceLine y={0} stroke="#374151" />
              <Line
                type="monotone"
                dataKey="cumul"
                stroke={envelope.color}
                strokeWidth={2}
                dot={{ r: 3, fill: envelope.color }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="mensuel"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 justify-center text-[11px] mt-1">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-3 h-0.5" style={{ backgroundColor: envelope.color }} /> Cumul
              bénéfices
            </span>
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-3 border-t border-dashed border-gray-400" /> Mensuel attendu
            </span>
          </div>
        </div>

        {/* Table des mois avec flux */}
        {significantMonths.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">
              Détail mois par mois
            </p>
            <div className="divide-y divide-gray-800">
              {significantMonths.map((m) => (
                <div key={m.month} className="py-2 flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16">{m.monthLabel}</span>
                  <div className="flex-1 space-y-0.5">
                    {m.details.map((d, i) => (
                      <p key={i} className="text-xs text-gray-300">
                        <span className="text-gray-500">{d.source}</span>
                        {d.income > 0 && (
                          <span className="text-emerald-400 ml-2 font-[family-name:var(--font-jetbrains)]">
                            +{formatEur(d.income)}
                            {mgaEurRate && (
                              <span className="text-[10px] text-emerald-400/60 ml-1">
                                ({formatMga(d.income * mgaEurRate)})
                              </span>
                            )}
                          </span>
                        )}
                        {d.capital > 0 && (
                          <span className="text-sky-400 ml-2 font-[family-name:var(--font-jetbrains)]">
                            (capital {formatEur(d.capital)}
                            {mgaEurRate && (
                              <span className="text-[10px] text-sky-400/60 ml-1">
                                · {formatMga(d.capital * mgaEurRate)}
                              </span>
                            )}
                            )
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                  <div className="text-right w-28">
                    <div className="text-sm font-[family-name:var(--font-jetbrains)] text-emerald-400">
                      +{formatEur(m.income)}
                    </div>
                    {mgaEurRate && (
                      <div className="text-[10px] text-emerald-400/60 font-[family-name:var(--font-jetbrains)]">
                        +{formatMga(m.income * mgaEurRate)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liste des règles utilisées */}
        <div className="text-[10px] text-gray-600 border-t border-gray-800 pt-3 space-y-1">
          <p className="uppercase tracking-wider">Règles utilisées (modifiables dans le code)</p>
          {positions.map((p) => {
            const rule = DEAL_RULES[p.ticker];
            return (
              <p key={p.id} className="font-[family-name:var(--font-jetbrains)]">
                <span className="text-gray-400">{p.ticker}</span> ·{" "}
                {rule?.description ?? <span className="text-amber-500">pas de règle (ignoré)</span>}
              </p>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
