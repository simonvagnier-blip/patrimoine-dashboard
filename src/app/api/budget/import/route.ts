import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { parseFortuneoCsvs, type UserRule } from "@/lib/fortuneo-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/budget/import — import in-app des CSV Fortuneo (C7), portage du CLI.
 * Body JSON : { cbCsv?, releveCsv?, mode: "preview" | "insert" | "wipe" }
 *   - preview : parse + breakdown, aucune écriture
 *   - insert  : ajoute les lignes
 *   - wipe    : DELETE * puis insère (remplacement complet)
 * Auth : session (middleware).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const cbCsv = typeof body.cbCsv === "string" ? body.cbCsv : "";
  const releveCsv = typeof body.releveCsv === "string" ? body.releveCsv : "";
  const mode = body.mode === "insert" || body.mode === "wipe" ? body.mode : "preview";

  if (!cbCsv && !releveCsv) {
    return NextResponse.json({ error: "Aucun CSV fourni" }, { status: 400 });
  }

  // Règles utilisateur persistées (priorité 0), comme le CLI.
  let userRules: UserRule[] = [];
  try {
    const rules = await db.select().from(schema.labelRules).all();
    userRules = rules.map((r) => ({
      pattern: r.pattern,
      match_type: r.match_type as UserRule["match_type"],
      category: r.category,
    }));
  } catch {
    // table absente → on continue sans règles perso
  }

  const parsed = parseFortuneoCsvs(cbCsv, releveCsv, userRules);

  const summary = {
    parsed: parsed.rows.length,
    cb_total: parsed.cb_total,
    releve_total: parsed.releve_total,
    skipped_dup: parsed.skipped_dup,
    by_year: parsed.by_year,
    by_category: parsed.by_category.slice(0, 15),
  };

  if (mode === "preview") {
    return NextResponse.json({ mode, ...summary, inserted: 0 });
  }

  let wiped = 0;
  if (mode === "wipe") {
    const before = await db.select().from(schema.budgetEntries).all();
    wiped = before.length;
    await db.delete(schema.budgetEntries).run();
  }

  const nowIso = new Date().toISOString();
  let inserted = 0;
  const CHUNK = 100;
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const slice = parsed.rows.slice(i, i + CHUNK);
    await db
      .insert(schema.budgetEntries)
      .values(
        slice.map((r) => ({
          type: r.type,
          category: r.category,
          label: r.label,
          amount: r.amount,
          date: r.date,
          recurring: 0,
          created_at: nowIso,
        }))
      )
      .run();
    inserted += slice.length;
  }

  return NextResponse.json({ mode, ...summary, wiped, inserted });
}
