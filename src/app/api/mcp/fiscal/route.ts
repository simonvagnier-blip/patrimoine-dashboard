import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { computeFiscalSummary } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;
  const data = await computeFiscalSummary();
  return NextResponse.json(data);
}
