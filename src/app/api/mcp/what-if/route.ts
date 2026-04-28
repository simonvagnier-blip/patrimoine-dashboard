import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { runWhatIf, type WhatIfParams } from "@/lib/what-if";

export const dynamic = "force-dynamic";

/**
 * POST avec body WhatIfParams (recommandé pour Claude).
 * GET sans paramètre = baseline (utile pour debug).
 */
export async function POST(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;
  const body = (await request.json().catch(() => ({}))) as WhatIfParams;
  const data = await runWhatIf(body ?? {});
  return NextResponse.json(data);
}

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;
  const data = await runWhatIf({});
  return NextResponse.json(data);
}
