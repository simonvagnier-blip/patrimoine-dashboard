import { NextRequest, NextResponse } from "next/server";
import { fetchAppleCalendarEvents } from "@/lib/apple-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const serverUrl = process.env.APPLE_CALDAV_URL;
  const username = process.env.APPLE_CALDAV_USERNAME;
  const password = process.env.APPLE_CALDAV_PASSWORD;

  if (!serverUrl || !username || !password) {
    return NextResponse.json(
      { error: "not_configured", message: "Apple Calendar non configuré. Ajoutez APPLE_CALDAV_URL, APPLE_CALDAV_USERNAME et APPLE_CALDAV_PASSWORD." },
      { status: 400 }
    );
  }

  const days = parseInt(request.nextUrl.searchParams.get("days") || "7");
  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);

  try {
    const events = await fetchAppleCalendarEvents(serverUrl, username, password, now, end);
    return NextResponse.json({ events });
  } catch (error) {
    console.error("Apple Calendar fetch error:", error);
    return NextResponse.json(
      { error: "fetch_failed", message: "Impossible de récupérer les événements Apple Calendar" },
      { status: 500 }
    );
  }
}
