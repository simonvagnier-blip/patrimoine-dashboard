import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, auth API, Google OAuth callback, cron jobs,
  // MCP data endpoints (bearer check), OAuth server endpoints (gèrent leur
  // propre auth — login page / DCR / token / discovery).
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/google") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/api/oauth") ||
    pathname.startsWith("/.well-known/") ||
    // Assets PWA (C3) : non sensibles, et le service worker doit pouvoir se
    // mettre à jour même session expirée (sinon SW figé jusqu'au login).
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png" ||
    pathname === "/apple-touch-icon.png"
  ) {
    return NextResponse.next();
  }

  // Vérifie le jeton de session SIGNÉ (HMAC). Un cookie posé à la main sans la
  // clé secrète (DASHBOARD_PASSWORD) échoue la vérification → redirigé vers
  // /login. fail-closed : si le secret n'est pas configuré, on refuse l'accès.
  const token = request.cookies.get("session")?.value;
  const secret = process.env.DASHBOARD_PASSWORD;
  if (!secret || !(await verifySessionToken(token, secret))) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
