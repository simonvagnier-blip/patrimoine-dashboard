/**
 * Helpers de conversion devise pour les positions à valeur manuelle.
 *
 * Les positions cotées (yahoo_ticker + quantity + pru) sont déjà gérées par la
 * logique de quotes (USD → EUR via eurUsd, EUR direct). Mais les positions
 * `manual_value` (fonds euros, business Madagascar, espèces) stockent la valeur
 * dans la devise native (EUR, USD, MGA) — il faut convertir pour les afficher
 * en EUR côté UI.
 *
 * Utilisé par DashboardClient, ProjectionsClient, EnvelopeDetailClient, etc.
 * Server-side (portfolio-state.ts), la même logique est appliquée à la main.
 */

export interface RateMap {
  eurUsd: number; // 1 USD = 1/eurUsd EUR  → priceEur = priceUsd / eurUsd
  mgaEurRate: number; // 1 EUR = mgaEurRate MGA  → valueEur = valueMga / mgaEurRate
}

/**
 * Convertit un manual_value en EUR selon sa devise. Si currency est inconnue
 * ou EUR, renvoie la valeur telle quelle.
 */
export function manualValueToEur(
  manual_value: number,
  currency: string | null | undefined,
  rates: { eurUsd?: number; mgaEurRate?: number },
): number {
  if (currency === "MGA") {
    const rate = rates.mgaEurRate ?? 4800;
    return manual_value / rate;
  }
  if (currency === "USD") {
    const rate = rates.eurUsd ?? 1.08;
    return manual_value / rate;
  }
  return manual_value;
}
