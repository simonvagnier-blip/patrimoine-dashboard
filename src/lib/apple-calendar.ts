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

// Extract a field value and its parameters from iCal data
function getFieldWithParams(vcal: string, name: string): { value: string; params: string } | null {
  // Anchor to line start to avoid matching substrings (e.g., X-LIC-LOCATION matching LOCATION)
  const regex = new RegExp(`(?:^|\\n)${name}([^:]*):([^\\r\\n]+)`, "m");
  const match = vcal.match(regex);
  if (!match) return null;
  return { params: match[1].trim(), value: match[2].trim() };
}

function getField(vcal: string, name: string): string | null {
  const result = getFieldWithParams(vcal, name);
  return result ? result.value : null;
}

// Parse an iCal datetime string into a proper ISO string
function parseICalDate(dt: string, params?: string): string {
  if (!dt) return new Date().toISOString();
  // All-day: YYYYMMDD
  if (dt.length === 8) {
    return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
  }
  // UTC: ends with Z
  if (dt.endsWith("Z")) {
    const clean = dt.replace("Z", "");
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}Z`;
  }
  // Local time (with or without TZID) — return naive ISO string
  // The browser will interpret it as local time, which is correct since
  // the user and events are both in Europe/Paris
  const isoNaive = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${dt.slice(9, 11)}:${dt.slice(11, 13)}:${dt.slice(13, 15)}`;
  return isoNaive;
}

// Parse RRULE into a structured object
interface RRule {
  freq: string;
  interval: number;
  until: Date | null;
  count: number | null;
  byday: string[] | null;
}

function parseRRule(rruleStr: string): RRule | null {
  if (!rruleStr) return null;
  const parts: Record<string, string> = {};
  for (const part of rruleStr.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k] = v;
  }
  if (!parts.FREQ) return null;
  return {
    freq: parts.FREQ,
    interval: parts.INTERVAL ? parseInt(parts.INTERVAL) : 1,
    until: parts.UNTIL ? new Date(parseICalDate(parts.UNTIL)) : null,
    count: parts.COUNT ? parseInt(parts.COUNT) : null,
    byday: parts.BYDAY ? parts.BYDAY.split(",") : null,
  };
}

// Expand a recurring event into individual occurrences within a time range
function expandRecurrence(
  baseStart: Date,
  baseEnd: Date,
  rrule: RRule,
  rangeStart: Date,
  rangeEnd: Date,
  exdates: Set<string>
): Array<{ start: Date; end: Date }> {
  const occurrences: Array<{ start: Date; end: Date }> = [];
  const durationMs = baseEnd.getTime() - baseStart.getTime();
  const maxOccurrences = rrule.count || 1000; // safety limit
  const endDate = rrule.until || rangeEnd;
  let count = 0;
  let current = new Date(baseStart);

  while (current <= endDate && count < maxOccurrences) {
    const occEnd = new Date(current.getTime() + durationMs);
    // Check if this occurrence falls within the range and isn't excluded
    if (current >= rangeStart || occEnd >= rangeStart) {
      if (current <= rangeEnd) {
        const dateKey = current.toISOString().split("T")[0];
        if (!exdates.has(dateKey)) {
          occurrences.push({ start: new Date(current), end: occEnd });
        }
      }
    }
    count++;

    // Advance to next occurrence
    switch (rrule.freq) {
      case "DAILY":
        current.setDate(current.getDate() + rrule.interval);
        break;
      case "WEEKLY":
        current.setDate(current.getDate() + 7 * rrule.interval);
        break;
      case "MONTHLY":
        current.setMonth(current.getMonth() + rrule.interval);
        break;
      case "YEARLY":
        current.setFullYear(current.getFullYear() + rrule.interval);
        break;
      default:
        return occurrences;
    }
  }

  return occurrences;
}

// Extract just the VEVENT block from a VCALENDAR
function extractVEvent(vcal: string): string | null {
  const start = vcal.indexOf("BEGIN:VEVENT");
  const end = vcal.indexOf("END:VEVENT");
  if (start === -1 || end === -1) return null;
  return vcal.slice(start, end + "END:VEVENT".length);
}

// Parse iCal VEVENT data — returns an array (recurring events expand to multiple)
function parseVEvent(vcal: string, rangeStart: Date, rangeEnd: Date): AppleCalendarEvent[] {
  try {
  // Extract only the VEVENT block to avoid matching VTIMEZONE fields
  const veventBlock = extractVEvent(vcal);
  if (!veventBlock) return [];
  const summary = getField(veventBlock, "SUMMARY");
  if (!summary) return [];

  const dtstartInfo = getFieldWithParams(veventBlock, "DTSTART");
  const dtendInfo = getFieldWithParams(veventBlock, "DTEND");
  const uid = getField(veventBlock, "UID") || Math.random().toString(36);
  const location = getField(veventBlock, "LOCATION");
  const description = getField(veventBlock, "DESCRIPTION");
  const rruleStr = getField(veventBlock, "RRULE");

  const dtstart = dtstartInfo?.value || null;
  const dtend = dtendInfo?.value || null;
  const allDay = dtstart ? dtstart.length === 8 : false;

  const startStr = parseICalDate(dtstart || "", dtstartInfo?.params);
  const endStr = parseICalDate(dtend || dtstart || "", dtendInfo?.params);

  // Collect EXDATE entries (excluded dates for recurring events)
  const exdates = new Set<string>();
  const exdateRegex = /EXDATE[^:]*:(.+?)(?:\r?\n|$)/g;
  let exMatch;
  while ((exMatch = exdateRegex.exec(veventBlock)) !== null) {
    const val = exMatch[1].trim();
    for (const d of val.split(",")) {
      const parsed = parseICalDate(d.trim());
      exdates.add(new Date(parsed).toISOString().split("T")[0]);
    }
  }

  // If no recurrence, return single event
  if (!rruleStr) {
    return [{
      id: uid,
      title: summary,
      start: startStr,
      end: endStr,
      allDay,
      location,
      description,
    }];
  }

  // Parse and expand recurrence
  const rrule = parseRRule(rruleStr);
  if (!rrule) {
    return [{
      id: uid,
      title: summary,
      start: startStr,
      end: endStr,
      allDay,
      location,
      description,
    }];
  }

  const baseStart = new Date(startStr);
  const baseEnd = new Date(endStr);
  const occurrences = expandRecurrence(baseStart, baseEnd, rrule, rangeStart, rangeEnd, exdates);

  return occurrences.map((occ, i) => ({
    id: `${uid}_${i}`,
    title: summary,
    start: allDay
      ? `${occ.start.getUTCFullYear()}-${String(occ.start.getUTCMonth() + 1).padStart(2, "0")}-${String(occ.start.getUTCDate()).padStart(2, "0")}`
      : occ.start.toISOString().replace(".000Z", "Z"),
    end: allDay
      ? `${occ.end.getUTCFullYear()}-${String(occ.end.getUTCMonth() + 1).padStart(2, "0")}-${String(occ.end.getUTCDate()).padStart(2, "0")}`
      : occ.end.toISOString().replace(".000Z", "Z"),
    allDay,
    location,
    description,
  }));
  } catch (err) {
    console.error("[parseVEvent] Error parsing event:", err);
    return [];
  }
}

export interface DebugInfo {
  calendars: Array<{ name: string; objectCount: number }>;
  rawSamples: string[];
  parseResults: Array<{ summary: string | null; dtstart: string | null; parsed: number }>;
}

export async function fetchAppleCalendarEvents(
  serverUrl: string,
  username: string,
  password: string,
  timeStart: Date,
  timeEnd: Date,
  debug?: boolean
): Promise<{ events: AppleCalendarEvent[]; debugInfo?: DebugInfo }> {
  const client = await createDAVClient({
    serverUrl,
    credentials: { username, password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  const calendars = await client.fetchCalendars();
  const debugData: DebugInfo = { calendars: [], rawSamples: [], parseResults: [] };

  const events: AppleCalendarEvent[] = [];

  for (const cal of calendars) {
    const objects = await client.fetchCalendarObjects({
      calendar: cal,
      timeRange: {
        start: timeStart.toISOString(),
        end: timeEnd.toISOString(),
      },
    });

    if (debug) {
      debugData.calendars.push({ name: String(cal.displayName || "unnamed"), objectCount: objects.length });
    }

    for (const obj of objects) {
      if (obj.data) {
        if (debug && debugData.rawSamples.length < 5) {
          debugData.rawSamples.push(obj.data.slice(0, 600));
        }
        const parsed = parseVEvent(obj.data, timeStart, timeEnd);
        if (debug) {
          const summary = getField(obj.data, "SUMMARY");
          const dtstartInfo = getFieldWithParams(obj.data, "DTSTART");
          debugData.parseResults.push({
            summary,
            dtstart: dtstartInfo?.value || null,
            parsed: parsed.length,
          });
        }
        events.push(...parsed);
      }
    }
  }

  const sorted = events.sort((a, b) => a.start.localeCompare(b.start));
  return { events: sorted, debugInfo: debug ? debugData : undefined };
}
