import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 *
 * claude.ai (et autres MCP clients) GET ce endpoint pour découvrir où sont
 * authorize / token / register. Sans ce JSON, ils ne peuvent pas lancer le
 * flow OAuth.
 */
export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: ["mcp"],
    service_documentation: `${base}/`,
  });
}
