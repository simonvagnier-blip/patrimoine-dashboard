"use client";

import { useState, useEffect, useCallback } from "react";
import type { CalendarEvent, CalendarSource } from "./types";

export function useCalendarEvents(
  sources: CalendarSource[],
  startDate: Date,
  endDate: Date
) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const allEvents: CalendarEvent[] = [];

    const fetches = sources.map(async (source) => {
      try {
        if (source === "pro") {
          const res = await fetch(
            `/api/google/events?timeMin=${startDate.toISOString()}&timeMax=${endDate.toISOString()}`
          );
          if (res.ok) {
            const data = await res.json();
            return (data.events || []).map((e: CalendarEvent) => ({ ...e, source: "pro" as const }));
          }
        } else {
          const res = await fetch(`/api/apple-calendar?timeMin=${startDate.toISOString()}&timeMax=${endDate.toISOString()}`);
          if (res.ok) {
            const data = await res.json();
            return (data.events || []).map((e: CalendarEvent) => ({ ...e, source: "perso" as const }));
          }
        }
      } catch {
        // Source unavailable
      }
      return [];
    });

    const results = await Promise.all(fetches);
    for (const r of results) allEvents.push(...r);

    allEvents.sort((a, b) => a.start.localeCompare(b.start));
    setEvents(allEvents);
    setLoading(false);
  }, [sources.join(","), startDate.toISOString(), endDate.toISOString()]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, refresh: fetchEvents };
}
