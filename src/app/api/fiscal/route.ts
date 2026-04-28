import { NextResponse } from "next/server";
import { computeFiscalSummary } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await computeFiscalSummary();
  return NextResponse.json(data);
}
