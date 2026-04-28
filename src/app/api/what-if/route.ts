import { NextRequest, NextResponse } from "next/server";
import { runWhatIf, type WhatIfParams } from "@/lib/what-if";

export const dynamic = "force-dynamic";

/**
 * POST /api/what-if
 * Body: WhatIfParams { horizon_years?, envelope_extras? }
 * Renvoie WhatIfResult (baseline vs whatif par scenario, deltas).
 *
 * NB: GET acceptée aussi pour faciliter le debug (sans paramètre = baseline pure).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as WhatIfParams;
  const data = await runWhatIf(body ?? {});
  return NextResponse.json(data);
}

export async function GET() {
  const data = await runWhatIf({});
  return NextResponse.json(data);
}
