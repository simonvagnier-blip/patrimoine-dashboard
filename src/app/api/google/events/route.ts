import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCalendarEvents } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("google_access_token")?.value;
  const refreshToken = cookieStore.get("google_refresh_token")?.value;

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "not_connected", message: "Google Calendar non connecté" }, { status: 401 });
  }

  // Default: current week
  const timeMin = request.nextUrl.searchParams.get("timeMin") || new Date().toISOString();
  const timeMaxDefault = new Date();
  timeMaxDefault.setDate(timeMaxDefault.getDate() + 7);
  const timeMax = request.nextUrl.searchParams.get("timeMax") || timeMaxDefault.toISOString();

  try {
    const events = await getCalendarEvents(accessToken, refreshToken, timeMin, timeMax);
    return NextResponse.json({ events });
  } catch (error) {
    console.error("Google Calendar fetch error:", error);
    return NextResponse.json({ error: "fetch_failed", message: "Impossible de récupérer les événements" }, { status: 500 });
  }
}
