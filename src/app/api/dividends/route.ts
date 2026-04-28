import { NextRequest, NextResponse } from "next/server";
import { computeDividendSummary } from "@/lib/dividend-summary";
import { getDividendInfo } from "@/lib/dividends";

export const dynamic = "force-dynamic";

/**
 * GET /api/dividends                → résumé global (toutes positions)
 * GET /api/dividends?ticker=CVX     → détail d'un ticker (yield, prochaine ex-date, etc.)
 */
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (ticker) {
    const info = await getDividendInfo(ticker);
    if (!info) {
      return NextResponse.json(
        { error: `No dividend info for ${ticker}` },
        { status: 404 }
      );
    }
    return NextResponse.json(info);
  }
  const summary = await computeDividendSummary();
  return NextResponse.json(summary);
}
