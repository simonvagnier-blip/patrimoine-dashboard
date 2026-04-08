import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, auth API, Google OAuth callback, and debug
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/google") ||
    pathname.startsWith("/api/debug-env")
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
