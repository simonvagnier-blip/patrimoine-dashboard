import { NextRequest, NextResponse } from "next/server";
import { computeBudgetSummary } from "@/lib/budget";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const monthsParam = request.nextUrl.searchParams.get("months");
  const months = monthsParam ? Math.min(60, Math.max(1, parseInt(monthsParam))) : 12;
  const data = await computeBudgetSummary(months);
  return NextResponse.json(data);
}
