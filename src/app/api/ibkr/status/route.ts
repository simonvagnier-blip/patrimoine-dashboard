import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { computeReconciliation } from "@/lib/ibkr-flex";

export const dynamic = "force-dynamic";

async function readParam<T>(key: string): Promise<T | null> {
  const row = await db
    .select()
    .from(schema.userParams)
    .where(eq(schema.userParams.key, key))
    .get();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

/**
 * GET /api/ibkr/status — état de l'intégration IBKR pour l'UI :
 * configuré ?, dernier sync, réconciliation Dashboard↔IBKR, dividendes annoncés.
 */
export async function GET() {
  const configured = !!(process.env.IBKR_FLEX_TOKEN && process.env.IBKR_FLEX_QUERY_ID);
  const lastSync = await readParam<Record<string, unknown>>("ibkrSyncLog");
  const accruals = await readParam<{ at: string; rows: unknown[] }>("ibkrDividendAccruals");
  const reconciliation = await computeReconciliation();

  return NextResponse.json({
    configured,
    last_sync: lastSync,
    reconciliation,
    dividend_accruals: accruals?.rows ?? [],
  });
}
