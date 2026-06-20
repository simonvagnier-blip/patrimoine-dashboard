import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionToken, SESSION_TTL_MS } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD not configured" },
      { status: 500 }
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  // Jeton de session SIGNÉ (HMAC) — le proxy le vérifie. Remplace l'ancien
  // cookie `session_valid=true` statique qui était forgeable à la main.
  const token = await createSessionToken(expected, SESSION_TTL_MS);
  const cookieStore = await cookies();

  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000, // en secondes
    path: "/",
  });

  // Nettoie l'ancien cookie forgeable s'il traîne encore côté navigateur.
  cookieStore.set("session_valid", "", { maxAge: 0, path: "/" });

  return NextResponse.json({ success: true });
}
