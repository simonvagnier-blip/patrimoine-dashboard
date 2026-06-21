/**
 * Règles des deals "business" (Madagascar) — SOURCE UNIQUE partagée entre la
 * carte de projection (BusinessProjectionCard) et les alertes d'échéance
 * (/api/alerts). Avant : dupliqué/hardcodé dans la carte uniquement.
 *
 * Types de deals :
 *   - loan      : prêt à intérêt mensuel (yield_pct/mois × principal), part
 *                 my_share_pct, capital remboursé à exit_date.
 *   - one_shot  : sortie unique (principal × exit_multiple) à exit_date.
 *   - cash      : cagnotte de réception, pas de croissance propre.
 *
 * À migrer un jour dans un champ notes JSON par position (quand > qqs deals).
 */

export interface DealRule {
  type: "loan" | "one_shot" | "cash";
  monthly_yield_pct?: number; // 10 = 10%
  exit_multiple?: number; // 1.5 = +50%
  my_share_pct?: number; // 50 = je touche 50% des bénéfices
  exit_date?: string; // YYYY-MM-DD
  description?: string;
}

export const DEAL_RULES: Record<string, DealRule> = {
  "TEX-LOAN": {
    type: "loan",
    monthly_yield_pct: 10,
    my_share_pct: 50,
    exit_date: "2026-12-31",
    description: "Prêt à 10%/mois × 50% de part, capital remb. à terme",
  },
  "HAR-S26": {
    type: "one_shot",
    exit_multiple: 1.5,
    my_share_pct: 50,
    exit_date: "2026-09-30",
    description: "Avance semences, vente +50% en septembre, 50% de part",
  },
  "CASH-MGA": {
    type: "cash",
    description: "Réception des intérêts mensuels et plus-values",
  },
};

export interface DealDeadline {
  ticker: string;
  exit_date: string;
  days_left: number;
  description?: string;
}

/**
 * Deals dont la date de sortie tombe dans `withinDays` jours (et pas encore
 * passée). `today` injecté pour testabilité. Trié par échéance la plus proche.
 */
export function upcomingDealDeadlines(today: Date, withinDays = 60): DealDeadline[] {
  const out: DealDeadline[] = [];
  for (const [ticker, rule] of Object.entries(DEAL_RULES)) {
    if (!rule.exit_date) continue;
    const exit = new Date(rule.exit_date + "T00:00:00Z");
    const daysLeft = Math.ceil((exit.getTime() - today.getTime()) / 86400000);
    if (daysLeft >= 0 && daysLeft <= withinDays) {
      out.push({ ticker, exit_date: rule.exit_date, days_left: daysLeft, description: rule.description });
    }
  }
  return out.sort((a, b) => a.days_left - b.days_left);
}
