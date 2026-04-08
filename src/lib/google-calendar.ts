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

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    maxResults: 50,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items || []).map((event) => ({
    id: event.id,
    title: event.summary || "(sans titre)",
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    allDay: !event.start?.dateTime,
    location: event.location || null,
    description: event.description || null,
    color: event.colorId || null,
    htmlLink: event.htmlLink || null,
  }));
}
