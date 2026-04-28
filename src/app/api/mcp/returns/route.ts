import { NextRequest, NextResponse } from "next/server";
import { requireMcpToken } from "@/lib/mcp-auth";
import { computeReturns } from "@/lib/returns";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = requireMcpToken(request);
  if (unauth) return unauth;
  const data = await computeReturns();
  return NextResponse.json(data);
}
