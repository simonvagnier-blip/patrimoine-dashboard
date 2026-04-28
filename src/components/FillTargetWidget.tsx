"use client";

import Link from "next/link";

/**
 * Widget compact qui s'affiche en haut du dashboard global pour chaque
 * enveloppe ayant un objectif (`target`) ET une date limite (`fill_end_year`).
 *
 * Pour chaque enveloppe :
 *   - barre de progression vers l'objectif
 *   - X mois restants
 *   - Y €/mois requis (= (target - current) / months_left)
 *   - badge urgence si <12 mois et <80% atteints
 *
 * Le widget est cliquable et amène vers la page détail de l'enveloppe.
 */

interface FillTargetEnvelope {
  id: string;
  name: string;
  color: string;
  type: string;
  target: number | null;
  fill_end_year: number | null;
  total: number;
  /**
   * Versements cumulés pour les enveloppes à plafond de dépôts (PEA).
   * Pour un PEA, la progression vers le plafond 150k€ porte sur les VERSEMENTS,
   * pas sur la valeur de marché (qui inclut les plus-values latentes). Si
   * fourni sur un PEA, on l'utilise comme numérateur. Sinon fallback sur `total`.
   */
  deposits?: number | null;
}

function formatEur(v: number, d = 0): string {
  return v.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: d,
  });
}

export default function FillTargetWidget({
  envelopes,
  basePath = "",
}: {
  envelopes: FillTargetEnvelope[];
  basePath?: string;
}) {
  const withTargets = envelopes.filter(
    (e) => e.target && e.fill_end_year
  );
  if (withTargets.length === 0) return null;

  const now = new Date();
  const currentMonth = now.getFullYear() * 12 + now.getMonth();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {withTargets.map((env) => {
        const target = env.target!;
        // Sur PEA, le plafond porte sur les versements cumulés (pas la valeur
        // de marché). On utilise `deposits` si fourni, sinon fallback `total`
        // (ancien comportement pour les non-PEA ou PEA sans data).
        const isPea = env.type === "pea";
        const progressValue =
          isPea && env.deposits !== null && env.deposits !== undefined
            ? env.deposits
            : env.total;
        const remaining = Math.max(0, target - progressValue);
        const pct = Math.min(100, (progressValue / target) * 100);

        // Mois restants jusqu'à fin de fill_end_year (décembre inclus)
        const endMonth = env.fill_end_year! * 12 + 11;
        const monthsLeft = Math.max(0, endMonth - currentMonth);
        const monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : remaining;

        const reached = remaining < 1;
        const overdue = monthsLeft === 0 && !reached;
        const tightTimeline = monthsLeft > 0 && monthsLeft <= 12 && pct < 80;

        const tone = reached
          ? "border-emerald-700"
          : overdue
            ? "border-red-700"
            : tightTimeline
              ? "border-amber-700"
              : "border-gray-800";

        return (
          <Link
            key={env.id}
            href={`${basePath}/envelope/${env.id}`}
            className={`block bg-[#0d1117] border ${tone} rounded-lg p-3 hover:border-gray-600 transition-colors`}
          >
            <div className="flex items-baseline justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: env.color }}
                />
                <span className="text-sm text-white truncate">{env.name}</span>
                <span className="text-[10px] text-gray-600 uppercase">
                  Objectif {env.fill_end_year}
                </span>
              </div>
              <span className="text-xs font-[family-name:var(--font-jetbrains)] text-gray-400 flex-shrink-0 ml-2">
                {pct.toFixed(0)}%
              </span>
            </div>

            {/* Barre de progression */}
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: env.color,
                  opacity: reached ? 0.9 : 0.7,
                }}
              />
            </div>

            <div className="flex items-baseline justify-between text-xs gap-2 flex-wrap">
              <span className="text-gray-500 font-[family-name:var(--font-jetbrains)]">
                {formatEur(progressValue)} / {formatEur(target)}
                {isPea && (
                  <span
                    className="ml-1 text-gray-600"
                    title="Le plafond PEA porte sur les versements cumulés, pas sur la valeur de marché"
                  >
                    versés
                  </span>
                )}
              </span>
              {reached ? (
                <span className="text-emerald-400 font-medium">✓ Atteint</span>
              ) : overdue ? (
                <span className="text-red-400 font-[family-name:var(--font-jetbrains)]">
                  Échéance dépassée · reste {formatEur(remaining)}
                </span>
              ) : (
                <span
                  className={`font-[family-name:var(--font-jetbrains)] ${
                    tightTimeline ? "text-amber-400" : "text-gray-300"
                  }`}
                >
                  {formatEur(monthlyNeeded)}/mois pendant {monthsLeft} mois
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
