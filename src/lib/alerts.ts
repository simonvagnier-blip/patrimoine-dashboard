import { db, schema } from "@/lib/db";
import { loadPortfolioState, type EnrichedPosition } from "@/lib/portfolio-state";
import type { AlertType, EvaluatedAlert } from "@/lib/alerts-types";

// Re-export pour rester compatible avec les imports existants côté serveur.
export type { AlertType, EvaluatedAlert };
export { ALERT_LABELS } from "@/lib/alerts-types";

/**
 * LOT 2 — Alert evaluation engine.
 *
 * Alerts are stored as configurations in the `alerts` table. Each call to
 * `evaluateAlerts()` joins the configs with the current portfolio state and
 * returns rows enriched with:
 *   - the actual current value of the watched metric
 *   - a `triggered` boolean (true if the threshold is crossed)
 *   - a human-readable label so the UI / Claude can render directly.
 *
 * Side-effect: when an alert is evaluated as triggered, we bump
 * `last_triggered_at` to now. This lets the UI show "vu pour la dernière fois
 * il y a Xh" and lets us suppress re-notifying within a debounce window
 * (handled at notification layer, not here).
 */

interface PositionLite {
  id: number;
  ticker: string;
  label: string;
  currency: string;
  current_price: number | null;
  current_price_currency: string | null;
  pnl_pct: number | null;
  weight_pct?: number;
}

function currentValueForPositionAlert(
  type: AlertType,
  pos: EnrichedPosition
): number | null {
  switch (type) {
    case "price_above":
    case "price_below":
      return pos.current_price;
    case "pnl_pct_above":
    case "pnl_pct_below":
      return pos.pnl_pct;
    case "weight_above":
      return (pos as PositionLite).weight_pct ?? null;
    default:
      return null;
  }
}

function checkTriggered(
  type: AlertType,
  current: number | null,
  threshold: number
): boolean {
  if (current === null) return false;
  if (
    type === "price_above" ||
    type === "pnl_pct_above" ||
    type === "weight_above" ||
    type === "envelope_value_above"
  ) {
    return current > threshold;
  }
  return current < threshold;
}

function unitFor(type: AlertType, position?: EnrichedPosition | null): string {
  if (type === "price_above" || type === "price_below") {
    return position?.currency === "USD" ? "$" : "€";
  }
  if (type === "envelope_value_above" || type === "envelope_value_below") {
    return "€";
  }
  return "%";
}

function makeLabel(
  type: AlertType,
  threshold: number,
  scope: string,
  unit: string
): string {
  const op =
    type === "price_above" ||
    type === "pnl_pct_above" ||
    type === "weight_above" ||
    type === "envelope_value_above"
      ? "▲"
      : "▼";
  const fmt = unit === "€" || unit === "$"
    ? `${threshold.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${unit}`
    : `${threshold}%`;
  return `${scope} ${op} ${fmt}`;
}

export async function evaluateAlerts(): Promise<{
  fetched_at: string;
  alerts: EvaluatedAlert[];
}> {
  const [configs, state] = await Promise.all([
    db.select().from(schema.alerts).all(),
    loadPortfolioState(),
  ]);

  const positionById = new Map(state.positions.map((p) => [p.id, p]));
  const envelopeById = new Map(state.envelopes.map((e) => [e.id, e]));

  const evaluated: EvaluatedAlert[] = configs.map((cfg) => {
    const type = cfg.type as AlertType;
    let current: number | null = null;
    let scope_label = "—";
    let unit = "%";

    if (
      type === "envelope_value_above" ||
      type === "envelope_value_below"
    ) {
      const env = cfg.envelope_id ? envelopeById.get(cfg.envelope_id) : null;
      current = env?.total_value_eur ?? null;
      scope_label = env?.name ?? cfg.envelope_id ?? "?";
      unit = "€";
    } else if (cfg.position_id) {
      const pos = positionById.get(cfg.position_id);
      if (pos) {
        current = currentValueForPositionAlert(type, pos);
        scope_label = `${pos.ticker} ${pos.label}`;
        unit = unitFor(type, pos);
      }
    }

    const triggered = !!cfg.active && checkTriggered(type, current, cfg.threshold);

    return {
      id: cfg.id,
      envelope_id: cfg.envelope_id,
      position_id: cfg.position_id,
      type,
      threshold: cfg.threshold,
      note: cfg.note,
      active: !!cfg.active,
      last_triggered_at: cfg.last_triggered_at,
      current_value: current,
      triggered,
      label: makeLabel(type, cfg.threshold, scope_label, unit),
      scope_label,
      unit,
    };
  });

  // Bump last_triggered_at for newly triggered alerts (fire and forget).
  // We do this asynchronously so callers don't block on it.
  const nowIso = new Date().toISOString();
  const toBump = evaluated.filter((a) => a.triggered);
  if (toBump.length > 0) {
    Promise.all(
      toBump.map((a) =>
        db
          .update(schema.alerts)
          .set({ last_triggered_at: nowIso })
          .where(eqId(a.id))
          .run()
          .catch((err) => console.error("alert bump failed:", err))
      )
    );
  }

  return { fetched_at: state.fetched_at, alerts: evaluated };
}

// drizzle eq helper local import to keep imports tidy
import { eq } from "drizzle-orm";
function eqId(id: number) {
  return eq(schema.alerts.id, id);
}
