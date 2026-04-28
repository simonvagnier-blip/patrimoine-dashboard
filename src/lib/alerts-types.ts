/**
 * Types et constantes partagés entre client et serveur pour les alertes.
 * Ce fichier ne doit avoir aucune dépendance vers la DB ou des modules
 * server-only — il est importable depuis les composants client.
 */

export type AlertType =
  | "price_above"
  | "price_below"
  | "pnl_pct_above"
  | "pnl_pct_below"
  | "weight_above"
  | "envelope_value_above"
  | "envelope_value_below";

export const ALERT_LABELS: Record<AlertType, string> = {
  price_above: "Cours au-dessus de",
  price_below: "Cours en-dessous de",
  pnl_pct_above: "P&L au-dessus de",
  pnl_pct_below: "P&L en-dessous de",
  weight_above: "Poids dans le portefeuille >",
  envelope_value_above: "Valeur enveloppe au-dessus de",
  envelope_value_below: "Valeur enveloppe en-dessous de",
};

export interface EvaluatedAlert {
  id: number;
  envelope_id: string | null;
  position_id: number | null;
  type: AlertType;
  threshold: number;
  note: string | null;
  active: boolean;
  last_triggered_at: string | null;
  current_value: number | null;
  triggered: boolean;
  label: string;
  scope_label: string;
  unit: string;
}
