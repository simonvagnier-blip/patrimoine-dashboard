import { NextResponse } from "next/server";
import { runIbkrSync } from "@/lib/ibkr-flex";

export const dynamic = "force-dynamic";
// Le Flex Web Service peut prendre plusieurs secondes (génération + retries).
export const maxDuration = 120;

/**
 * POST /api/ibkr/sync — synchronisation manuelle IBKR (bouton UI).
 * Auth : session (middleware). Le cron nocturne fait la même chose.
 */
export async function POST() {
  const report = await runIbkrSync();
  return NextResponse.json(report, { status: report.ok || !report.configured ? 200 : 502 });
}
