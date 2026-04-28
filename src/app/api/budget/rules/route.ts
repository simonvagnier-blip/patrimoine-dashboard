import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, like, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Règles de catégorisation persistées. Accessibles via l'UI pour :
 *   - lister les règles existantes (GET)
 *   - créer une nouvelle règle + optionnellement re-catégoriser les entrées
 *     existantes qui matchent (POST { pattern, category, matchType?, applyToExisting? })
 *   - supprimer une règle (DELETE ?id=X)
 *
 * Les règles sont appliquées au prochain import CSV (voir scripts/import-fortuneo-csv.mjs)
 * et peuvent être utilisées à l'import pour override la catégorisation auto.
 */

export async function GET() {
  const rows = await db.select().from(schema.labelRules).all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const pattern = String(body.pattern ?? "").trim();
  const category = String(body.category ?? "").trim();
  const matchType = (body.matchType ?? "exact") as "exact" | "contains" | "starts_with";
  const applyToExisting = body.applyToExisting === true;

  if (!pattern || !category) {
    return NextResponse.json({ error: "pattern and category required" }, { status: 400 });
  }
  if (!["exact", "contains", "starts_with"].includes(matchType)) {
    return NextResponse.json({ error: "invalid matchType" }, { status: 400 });
  }

  // Upsert : si une règle existe déjà avec le même pattern + matchType, on update
  const existing = await db
    .select()
    .from(schema.labelRules)
    .where(
      and(
        eq(schema.labelRules.pattern, pattern),
        eq(schema.labelRules.match_type, matchType),
      ),
    )
    .get();

  let ruleId: number;
  if (existing) {
    await db
      .update(schema.labelRules)
      .set({ category })
      .where(eq(schema.labelRules.id, existing.id))
      .run();
    ruleId = existing.id;
  } else {
    const inserted = await db
      .insert(schema.labelRules)
      .values({
        pattern,
        match_type: matchType,
        category,
        created_at: new Date().toISOString(),
      })
      .returning()
      .get();
    ruleId = inserted.id;
  }

  let affected = 0;
  if (applyToExisting) {
    // Appliquer aux entrées budgétaires existantes qui matchent le pattern
    // Utilise LIKE insensible à la casse via lower().
    const lowerPattern = pattern.toLowerCase();
    const likeExpr =
      matchType === "exact"
        ? lowerPattern
        : matchType === "starts_with"
          ? `${lowerPattern}%`
          : `%${lowerPattern}%`;
    const result = await db
      .update(schema.budgetEntries)
      .set({ category })
      .where(sql`lower(${schema.budgetEntries.label}) LIKE ${likeExpr}`)
      .run();
    affected = Number((result as { rowsAffected?: number }).rowsAffected ?? 0);
  }

  return NextResponse.json({ id: ruleId, affected }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.labelRules).where(eq(schema.labelRules.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}

/**
 * PATCH : bulk re-categorize uniquement (sans créer de règle persistée).
 * Body: { label: string, category: string, matchType?: 'exact'|'contains'|'starts_with' }
 * Utile pour "je re-catégorise toutes les PIKKOPAY une fois, mais sans créer
 * de règle permanente pour les futurs imports".
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const label = String(body.label ?? "").trim();
  const category = String(body.category ?? "").trim();
  const matchType = (body.matchType ?? "exact") as "exact" | "contains" | "starts_with";

  if (!label || !category) {
    return NextResponse.json({ error: "label and category required" }, { status: 400 });
  }

  const lowerPattern = label.toLowerCase();
  const likeExpr =
    matchType === "exact"
      ? lowerPattern
      : matchType === "starts_with"
        ? `${lowerPattern}%`
        : `%${lowerPattern}%`;

  const result = await db
    .update(schema.budgetEntries)
    .set({ category })
    .where(sql`lower(${schema.budgetEntries.label}) LIKE ${likeExpr}`)
    .run();

  const affected = Number((result as { rowsAffected?: number }).rowsAffected ?? 0);
  return NextResponse.json({ affected });
}

// Utile pour prévisualiser combien d'entrées seraient affectées avant d'appliquer
export async function OPTIONS(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const label = searchParams.get("label")?.trim() ?? "";
  const matchType = (searchParams.get("matchType") ?? "exact") as
    | "exact"
    | "contains"
    | "starts_with";
  if (!label) return NextResponse.json({ count: 0 });

  const lowerPattern = label.toLowerCase();
  const likeExpr =
    matchType === "exact"
      ? lowerPattern
      : matchType === "starts_with"
        ? `${lowerPattern}%`
        : `%${lowerPattern}%`;

  const rows = await db
    .select()
    .from(schema.budgetEntries)
    .where(like(sql`lower(${schema.budgetEntries.label})`, likeExpr))
    .all();
  return NextResponse.json({ count: rows.length });
}
