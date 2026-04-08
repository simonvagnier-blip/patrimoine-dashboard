import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/google/callback`
  );
}

export function getAuthUrl() {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function getCalendarEvents(
  accessToken: string,
  refreshToken: string,
  timeMin: string,
  timeMax: string
) {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: client });

  // Fetch all calendars the user has access to
  const calendarList = await calendar.calendarList.list();
  const calendars = calendarList.data.items || [];

  const allEvents: Array<{
    id: string | null | undefined;
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    location: string | null;
    description: string | null;
    color: string | null;
    htmlLink: string | null;
    calendarName: string;
  }> = [];

  // Only keep the user's own calendars (primary + self-owned)
  // Skip other people's calendars and shared calendars
  const ownCalendars = calendars.filter((cal) => {
    if (!cal.id) return false;
    // Keep primary calendar
    if (cal.primary) return true;
    // Keep calendars the user owns
    if (cal.accessRole === "owner") return true;
    // Skip "reader" or "freeBusyReader" (other people's calendars)
    return false;
  });

  for (const cal of ownCalendars) {
    if (!cal.id) continue;
    try {
      const res = await calendar.events.list({
        calendarId: cal.id,
        timeMin,
        timeMax,
        maxResults: 100,
        singleEvents: true,
        orderBy: "startTime",
      });

      for (const event of res.data.items || []) {
        allEvents.push({
          id: event.id,
          title: event.summary || "(sans titre)",
          start: event.start?.dateTime || event.start?.date || "",
          end: event.end?.dateTime || event.end?.date || "",
          allDay: !event.start?.dateTime,
          location: event.location || null,
          description: event.description || null,
          color: event.colorId || cal.backgroundColor || null,
          htmlLink: event.htmlLink || null,
          calendarName: cal.summary || "Calendrier",
        });
      }
    } catch {
      // Skip calendars we can't access
      console.warn(`Could not fetch events from calendar: ${cal.summary}`);
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => a.start.localeCompare(b.start));

  return allEvents;
}
