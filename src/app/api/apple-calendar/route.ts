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

  // Support explicit timeMin/timeMax (like Google) or fallback to days param
  const timeMinParam = request.nextUrl.searchParams.get("timeMin");
  const timeMaxParam = request.nextUrl.searchParams.get("timeMax");
  const debug = request.nextUrl.searchParams.get("debug") === "1";

  let now: Date;
  let end: Date;

  if (timeMinParam && timeMaxParam) {
    now = new Date(timeMinParam);
    end = new Date(timeMaxParam);
  } else {
    const days = parseInt(request.nextUrl.searchParams.get("days") || "7");
    now = new Date();
    end = new Date();
    end.setDate(end.getDate() + days);
  }

  try {
    const result = await fetchAppleCalendarEvents(serverUrl, username, password, now, end, debug);
    if (debug) {
      return NextResponse.json({
        events: result.events,
        debug: {
          ...result.debugInfo,
          timeRange: { start: now.toISOString(), end: end.toISOString() },
        },
      });
    }
    return NextResponse.json({ events: result.events });
  } catch (error) {
    console.error("Apple Calendar fetch error:", error);
    return NextResponse.json(
      { error: "fetch_failed", message: "Impossible de récupérer les événements Apple Calendar" },
      { status: 500 }
    );
  }
}
