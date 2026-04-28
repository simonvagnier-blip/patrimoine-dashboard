import { NextRequest, NextResponse } from "next/server";

/**
 * Bearer token check for /api/mcp/* routes.
 *
 * MCP endpoints are read-only data feeds consumed by AI agents (Claude
 * Desktop, Claude Code, etc.) via a local MCP server. They bypass the
 * session cookie check in proxy.ts and authenticate via a Bearer token
 * stored in the `API_TOKEN` env var.
 *
 * Usage in a route handler:
 *   const unauthorized = requireMcpToken(request);
 *   if (unauthorized) return unauthorized;
 */
export function requireMcpToken(request: NextRequest): NextResponse | null {
  const expected = process.env.API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "API_TOKEN not configured on server" },
      { status: 500 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
