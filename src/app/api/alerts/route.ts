import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { evaluateAlerts } from "@/lib/alerts";
import { upcomingDealDeadlines } from "@/lib/business-deals";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set([
  "price_above",
  "price_below",
  "pnl_pct_above",
  "pnl_pct_below",
  "weight_above",
  "envelope_value_above",
  "envelope_value_below",
]);

/**
 * GET /api/alerts                 → list all alerts
 * GET /api/alerts?evaluate=true   → list with current values + triggered status
 * GET /api/alerts?position_id=X   → filter by position
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const evaluate = sp.get("evaluate") === "true";
  const positionId = sp.get("position_id");
  const envelopeId = sp.get("envelope_id");

  if (evaluate) {
    const data = await evaluateAlerts();
    let alerts = [...data.alerts];

    // Alerte CALCULÉE : plafond de versements PEA (150 000 € légal). Se déclenche
    // quand les versements cumulés approchent le plafond. Source de vérité :
    // userParams.peaVersements (saisi sur la page fiscal). Pas une alerte stockée
    // (id négatif synthétique) → calculée à la volée à chaque évaluation.
    try {
      const peaRow = await db
        .select()
        .from(schema.userParams)
        .where(eq(schema.userParams.key, "peaVersements"))
        .get();
      const versements = peaRow?.value ? parseFloat(peaRow.value) : NaN;
      const PEA_CAP = 150000;
      const PEA_WARN_RATIO = 0.85; // alerte à 85 % du plafond
      if (!isNaN(versements) && versements > 0) {
        const pct = Math.round((versements / PEA_CAP) * 100);
        alerts.push({
          id: -1,
          envelope_id: "pea",
          position_id: null,
          type: "envelope_value_above",
          threshold: Math.round(PEA_CAP * PEA_WARN_RATIO),
          note: "Plafond de versements PEA (150 000 €)",
          active: true,
          last_triggered_at: null,
          current_value: Math.round(versements),
          triggered: versements >= PEA_CAP * PEA_WARN_RATIO,
          label: `Plafond PEA bientôt atteint : ${pct} % (${Math.round(versements).toLocaleString("fr-FR")} / 150 000 € versés)`,
          scope_label: "PEA",
          unit: "€",
        });
      }
    } catch {
      // pas de plafond PEA calculable → on ignore
    }

    // Alertes CALCULÉES : échéances des deals business (Madagascar). Pour chaque
    // deal DÉTENU (position existante) dont la date de sortie tombe dans ≤ 60
    // jours, on lève une alerte. Dormante tant qu'aucune échéance n'approche.
    try {
      const deadlines = upcomingDealDeadlines(new Date(), 60);
      if (deadlines.length > 0) {
        const posRows = await db.select().from(schema.positions).all();
        const held = new Map(posRows.map((p) => [p.ticker, p.envelope_id]));
        deadlines.forEach((d, idx) => {
          if (!held.has(d.ticker)) return;
          alerts.push({
            id: -100 - idx,
            envelope_id: held.get(d.ticker) ?? null,
            position_id: null,
            type: "envelope_value_above",
            threshold: 0,
            note: d.description ?? null,
            active: true,
            last_triggered_at: null,
            current_value: null,
            triggered: true,
            label: `Échéance ${d.ticker} dans ${d.days_left} j (${d.exit_date})${d.description ? " — " + d.description : ""}`,
            scope_label: "Madagascar",
            unit: "€",
          });
        });
      }
    } catch {
      // pas d'échéance calculable → on ignore
    }

    if (positionId) alerts = alerts.filter((a) => a.position_id === parseInt(positionId));
    if (envelopeId) alerts = alerts.filter((a) => a.envelope_id === envelopeId);
    return NextResponse.json({ ...data, alerts });
  }

  let rows = await db.select().from(schema.alerts).all();
  if (positionId) rows = rows.filter((a) => a.position_id === parseInt(positionId));
  if (envelopeId) rows = rows.filter((a) => a.envelope_id === envelopeId);
  return NextResponse.json(rows);
}

/**
 * POST /api/alerts
 * Body: { type, threshold, position_id?, envelope_id?, note? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { type, threshold } = body;
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: `invalid type: ${type}` }, { status: 400 });
  }
  if (typeof threshold !== "number") {
    return NextResponse.json({ error: "threshold (number) required" }, { status: 400 });
  }

  // Validation: position-scoped vs envelope-scoped
  const isEnvelopeScoped = type.startsWith("envelope_");
  if (isEnvelopeScoped && !body.envelope_id) {
    return NextResponse.json({ error: "envelope_id required for envelope-scoped alerts" }, { status: 400 });
  }
  if (!isEnvelopeScoped && !body.position_id) {
    return NextResponse.json({ error: "position_id required for position-scoped alerts" }, { status: 400 });
  }

  const result = await db
    .insert(schema.alerts)
    .values({
      envelope_id: body.envelope_id ?? null,
      position_id: body.position_id ?? null,
      type,
      threshold,
      note: body.note ?? null,
      active: body.active === false ? 0 : 1,
    })
    .returning();
  return NextResponse.json(result[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (updates.type && !VALID_TYPES.has(updates.type)) {
    return NextResponse.json({ error: `invalid type` }, { status: 400 });
  }
  // Convert boolean active → 0/1
  if (typeof updates.active === "boolean") updates.active = updates.active ? 1 : 0;
  const result = await db
    .update(schema.alerts)
    .set(updates)
    .where(eq(schema.alerts.id, id))
    .returning();
  if (result.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(result[0]);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const result = await db
    .delete(schema.alerts)
    .where(eq(schema.alerts.id, parseInt(id)))
    .returning();
  if (result.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true, deleted: result[0] });
}
