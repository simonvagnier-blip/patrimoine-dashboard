import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * Décrit le serveur MCP en tant que ressource protégée et pointe vers le
 * serveur d'autorisation à utiliser (nous-mêmes). Permet aux clients MCP de
 * découvrir où s'authentifier quand ils reçoivent un 401 sur /api/mcp.
 */
export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  return NextResponse.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  });
}
