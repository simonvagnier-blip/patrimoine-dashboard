import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCalendarEvents, getOAuth2Client } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get("google_access_token")?.value;
  const refreshToken = cookieStore.get("google_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "not_connected", message: "Google Calendar non connecté" }, { status: 401 });
  }

  // If no access token or it might be expired, refresh it
  if (!accessToken) {
    try {
      const client = getOAuth2Client();
      client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await client.refreshAccessToken();
      accessToken = credentials.access_token || undefined;

      if (accessToken) {
        cookieStore.set("google_access_token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60,
          path: "/",
        });
      }
    } catch {
      return NextResponse.json({ error: "not_connected", message: "Token expiré, reconnectez-vous" }, { status: 401 });
    }
  }

  if (!accessToken) {
    return NextResponse.json({ error: "not_connected", message: "Pas de token valide" }, { status: 401 });
  }

  const timeMin = request.nextUrl.searchParams.get("timeMin") || new Date().toISOString();
  const timeMaxDefault = new Date();
  timeMaxDefault.setDate(timeMaxDefault.getDate() + 7);
  const timeMax = request.nextUrl.searchParams.get("timeMax") || timeMaxDefault.toISOString();

  try {
    const events = await getCalendarEvents(accessToken, refreshToken, timeMin, timeMax);
    return NextResponse.json({ events });
  } catch (error: unknown) {
    // If 401/403, try refreshing the token once
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("401") || errMsg.includes("403") || errMsg.includes("invalid_grant")) {
      try {
        const client = getOAuth2Client();
        client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await client.refreshAccessToken();
        accessToken = credentials.access_token || undefined;

        if (accessToken) {
          cookieStore.set("google_access_token", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60,
            path: "/",
          });

          const events = await getCalendarEvents(accessToken, refreshToken, timeMin, timeMax);
          return NextResponse.json({ events });
        }
      } catch {
        return NextResponse.json({ error: "not_connected", message: "Session expirée, reconnectez-vous" }, { status: 401 });
      }
    }

    console.error("Google Calendar fetch error:", error);
    return NextResponse.json({ error: "fetch_failed", message: "Impossible de récupérer les événements" }, { status: 500 });
  }
}
