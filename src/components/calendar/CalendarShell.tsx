"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarView, CalendarSource, CalendarEvent } from "./types";
import { SOURCE_COLORS } from "./types";
import { formatMonthYear, formatDateFull, addDays, startOfWeek, getWeekDays } from "./utils";
import { useCalendarEvents } from "./useCalendarEvents";
import DayView from "./DayView";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import MiniCalendar from "./MiniCalendar";
import EventDetailDialog from "./EventDetailDialog";
import type { Space } from "@/lib/spaces";

interface CalendarShellProps {
  sources: CalendarSource[];
  space: Space;
}

export default function CalendarShell({ sources, space }: CalendarShellProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeSources, setActiveSources] = useState<CalendarSource[]>(sources);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const isMerged = sources.length > 1;
  const bgColor = space === "pro" ? "bg-[#0a0f1e]" : "bg-[#080c14]";

  // Compute date range based on view
  const { rangeStart, rangeEnd } = useMemo(() => {
    const d = new Date(currentDate);
    if (view === "day") {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(start.getTime() + 86400000);
      return { rangeStart: start, rangeEnd: end };
    }
    if (view === "week") {
      const start = startOfWeek(d);
      const end = addDays(start, 7);
      return { rangeStart: start, rangeEnd: end };
    }
    // month — fetch a bit extra
    const start = new Date(d.getFullYear(), d.getMonth(), -6);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 7);
    return { rangeStart: start, rangeEnd: end };
  }, [currentDate, view]);

  const { events, loading } = useCalendarEvents(activeSources, rangeStart, rangeEnd);

  // Navigation
  function goToday() { setCurrentDate(new Date()); }
  function goPrev() {
    if (view === "day") setCurrentDate(addDays(currentDate, -1));
    else if (view === "week") setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  }
  function goNext() {
    if (view === "day") setCurrentDate(addDays(currentDate, 1));
    else if (view === "week") setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  }

  function handleDayClick(date: Date) {
    setCurrentDate(date);
    setView("day");
  }

  function toggleSource(src: CalendarSource) {
    setActiveSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
    );
  }

  // Title based on view
  const title = view === "day"
    ? formatDateFull(currentDate)
    : view === "week"
      ? (() => {
          const days = getWeekDays(currentDate);
          const first = days[0];
          const last = days[6];
          if (first.getMonth() === last.getMonth()) {
            return `${first.getDate()} – ${last.getDate()} ${formatMonthYear(first)}`;
          }
          return `${first.getDate()} ${first.toLocaleDateString("fr-FR", { month: "short" })} – ${last.getDate()} ${formatMonthYear(last)}`;
        })()
      : formatMonthYear(currentDate);

  const accentColor = space === "pro" ? "#3b82f6" : space === "perso" ? "#34d399" : "#a78bfa";

  return (
    <main className={`min-h-screen ${bgColor} p-4 md:p-6`}>
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Left: nav + title */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goPrev} className="border-gray-700 text-gray-400 hover:text-white h-8 w-8">
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday} className="border-gray-700 text-gray-400 hover:text-white text-xs h-8">
              Aujourd&apos;hui
            </Button>
            <Button variant="outline" size="icon" onClick={goNext} className="border-gray-700 text-gray-400 hover:text-white h-8 w-8">
              <ChevronRight size={16} />
            </Button>
            <h1 className="text-lg font-semibold text-white ml-2 capitalize">{title}</h1>
          </div>

          {/* Right: view selector + source toggles */}
          <div className="flex items-center gap-3">
            {/* Source toggles (only in merged mode) */}
            {isMerged && (
              <div className="flex gap-1.5">
                {(["pro", "perso"] as const).map((src) => {
                  const active = activeSources.includes(src);
                  const c = SOURCE_COLORS[src];
                  return (
                    <button
                      key={src}
                      onClick={() => toggleSource(src)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                        active
                          ? `${c.bg} ${c.text} border-current/30`
                          : "bg-transparent text-gray-500 border-gray-700"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${active ? c.dot : "bg-gray-600"}`} />
                      {src === "pro" ? "Pro" : "Perso"}
                    </button>
                  );
                })}
              </div>
            )}

            {/* View selector */}
            <div className="flex rounded-lg bg-[#161b22] p-0.5">
              {(["day", "week", "month"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    view === v ? "text-white" : "text-gray-500 hover:text-gray-300"
                  }`}
                  style={view === v ? { backgroundColor: accentColor + "20", color: accentColor } : {}}
                >
                  {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
            Chargement des événements...
          </div>
        )}

        {/* Content: mini cal + view */}
        <div className="flex gap-4">
          <MiniCalendar
            selectedDate={currentDate}
            onSelectDate={handleDayClick}
            events={events}
          />

          <div className="flex-1 min-w-0">
            {view === "day" && (
              <DayView
                events={events}
                date={currentDate}
                onEventClick={setSelectedEvent}
              />
            )}
            {view === "week" && (
              <WeekView
                events={events}
                weekStart={startOfWeek(currentDate)}
                onEventClick={setSelectedEvent}
                onDayClick={handleDayClick}
              />
            )}
            {view === "month" && (
              <MonthView
                events={events}
                month={currentDate}
                onDayClick={handleDayClick}
                onEventClick={setSelectedEvent}
              />
            )}
          </div>
        </div>
      </div>

      {/* Event detail */}
      <EventDetailDialog
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      />
    </main>
  );
}
