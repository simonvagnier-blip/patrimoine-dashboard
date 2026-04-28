import { NextResponse } from "next/server";
import { computeReturns } from "@/lib/returns";

export const dynamic = "force-dynamic";

/**
 * UI-facing endpoint (auth via session cookie, handled by proxy.ts).
 * Same payload as the MCP variant, just without the Bearer token check.
 */
export async function GET() {
  const data = await computeReturns();
  return NextResponse.json(data);
}
