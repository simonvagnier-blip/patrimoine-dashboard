import { createDAVClient, DAVCalendar, DAVObject } from "tsdav";

export interface AppleCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
}

// Parse iCal VEVENT data
function parseVEvent(vcal: string): AppleCalendarEvent | null {
  const getField = (name: string): string | null => {
    const regex = new RegExp(`${name}[^:]*:(.+?)(?:\\r?\\n|$)`, "s");
    const match = vcal.match(regex);
    return match ? match[1].trim() : null;
  };

  const summary = getField("SUMMARY");
  if (!summary) return null;

  const dtstart = getField("DTSTART");
  const dtend = getField("DTEND");
  const uid = getField("UID") || Math.random().toString(36);
  const location = getField("LOCATION");
  const description = getField("DESCRIPTION");

  // Check if all-day (date format YYYYMMDD vs datetime YYYYMMDDTHHMMSS)
  const allDay = dtstart ? dtstart.length === 8 : false;

  function parseDate(dt: string | null): string {
    if (!dt) return new Date().toISOString();
    if (dt.length === 8) {
      return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
    }
    // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
    const clean = dt.replace("Z", "");
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
  }

  return {
    id: uid,
    title: summary,
    start: parseDate(dtstart),
    end: parseDate(dtend),
    allDay,
    location,
    description,
  };
}

export async function fetchAppleCalendarEvents(
  serverUrl: string,
  username: string,
  password: string,
  timeStart: Date,
  timeEnd: Date
): Promise<AppleCalendarEvent[]> {
  const client = await createDAVClient({
    serverUrl,
    credentials: { username, password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  const calendars = await client.fetchCalendars();

  const events: AppleCalendarEvent[] = [];

  for (const cal of calendars) {
    const objects = await client.fetchCalendarObjects({
      calendar: cal,
      timeRange: {
        start: timeStart.toISOString(),
        end: timeEnd.toISOString(),
      },
    });

    for (const obj of objects) {
      if (obj.data) {
        const parsed = parseVEvent(obj.data);
        if (parsed) events.push(parsed);
      }
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}
