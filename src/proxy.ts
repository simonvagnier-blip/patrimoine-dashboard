import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, auth API, Google OAuth callback, debug, cron jobs,
  // MCP data endpoints (bearer check), OAuth server endpoints (gèrent leur
  // propre auth — login page / DCR / token / discovery).
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/google") ||
    pathname.startsWith("/api/debug-env") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/api/oauth") ||
    pathname.startsWith("/.well-known/")
  ) {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = request.cookies.get("session_valid");
  if (!session || session.value !== "true") {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
