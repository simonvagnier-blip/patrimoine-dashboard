"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarEvent, SOURCE_COLORS } from "./types";
import { formatTime, getEventTop, getEventHeight, isSameDay, isToday } from "./utils";

const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

interface DayViewProps {
  events: CalendarEvent[];
  date: Date;
  onEventClick: (e: CalendarEvent) => void;
}

export default function DayView({ events, date, onEventClick }: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  // Auto-scroll to 8:00 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo = (8 - START_HOUR) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  // Update "now" line every 60s
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const dayEvents = events.filter((e) => {
    const start = new Date(e.start);
    return isSameDay(start, date) && !e.allDay;
  });
  const allDayEvents = events.filter((e) => {
    const start = new Date(e.start);
    return isSameDay(start, date) && e.allDay;
  });

  const showNowLine = isToday(date);
  const nowTop = showNowLine ? getEventTop(now.toISOString(), START_HOUR, HOUR_HEIGHT) : 0;
  const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

  return (
    <div className="flex flex-col h-full">
      {/* All-day bar */}
      {allDayEvents.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/40 overflow-x-auto">
          <span className="text-[11px] text-gray-500 w-12 text-right pr-2 shrink-0">Journée</span>
          <div className="flex gap-1 flex-wrap">
            {allDayEvents.map((event) => {
              const colors = SOURCE_COLORS[event.source];
              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={`${colors.bg} ${colors.border} border-l-2 rounded px-2 py-0.5 text-xs text-white truncate max-w-[200px] cursor-pointer`}
                >
                  {event.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Scrollable hour grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div className="flex" style={{ height: totalHeight }}>
          {/* Hour labels */}
          <div className="shrink-0">
            {HOURS.map((hour) => (
              <div key={hour} className="h-[60px] flex items-start">
                <span className="text-[11px] text-gray-600 w-12 text-right pr-2 -translate-y-[7px]">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Events area */}
          <div className="flex-1 relative">
            {/* Hour lines */}
            {HOURS.map((hour, i) => (
              <div key={hour}>
                <div
                  className="border-t border-gray-800/40"
                  style={{ position: "absolute", top: i * HOUR_HEIGHT, left: 0, right: 0 }}
                />
                <div
                  className="border-t border-gray-800/20 border-dashed"
                  style={{ position: "absolute", top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2, left: 0, right: 0 }}
                />
              </div>
            ))}

            {/* Now line */}
            {showNowLine && nowTop >= 0 && nowTop <= totalHeight && (
              <div className="absolute left-0 right-0 z-20" style={{ top: nowTop }}>
                <div className="relative">
                  <div className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                  <div className="border-t-2 border-red-500/70 w-full" />
                </div>
              </div>
            )}

            {/* Event blocks */}
            {dayEvents.map((event) => {
              const top = getEventTop(event.start, START_HOUR, HOUR_HEIGHT);
              const height = getEventHeight(event.start, event.end, HOUR_HEIGHT);
              const colors = SOURCE_COLORS[event.source];
              return (
                <div
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={`absolute ${colors.bg} ${colors.border} rounded-md px-2 py-1 border-l-2 cursor-pointer overflow-hidden z-10`}
                  style={{ top, height, width: "calc(100% - 2px)", left: 0 }}
                >
                  <div className="text-xs font-medium text-white truncate">{event.title}</div>
                  <div className="text-[10px] text-gray-400 font-mono">
                    {formatTime(event.start)} - {formatTime(event.end)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
