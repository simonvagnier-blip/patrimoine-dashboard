"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarEvent, SOURCE_COLORS } from "./types";
import {
  formatTime,
  getEventTop,
  getEventHeight,
  getWeekDays,
  isSameDay,
  isToday,
} from "./utils";

const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface WeekViewProps {
  events: CalendarEvent[];
  weekStart: Date;
  onEventClick: (e: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
}

export default function WeekView({ events, weekStart, onEventClick, onDayClick }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const days = getWeekDays(weekStart);

  // Auto-scroll to 8:00 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT;
    }
  }, []);

  // Update "now" every 60s
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const todayIndex = days.findIndex((d) => isToday(d));
  const showNowLine = todayIndex !== -1;
  const nowTop = showNowLine ? getEventTop(now.toISOString(), START_HOUR, HOUR_HEIGHT) : 0;

  // Group events by day
  const eventsByDay = days.map((day) =>
    events.filter((e) => {
      const start = new Date(e.start);
      return isSameDay(start, day) && !e.allDay;
    })
  );

  const allDayByDay = days.map((day) =>
    events.filter((e) => {
      const start = new Date(e.start);
      return isSameDay(start, day) && e.allDay;
    })
  );

  const hasAnyAllDay = allDayByDay.some((arr) => arr.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div className="flex border-b border-gray-800/40">
        <div className="w-12 shrink-0" />
        <div className="grid grid-cols-7 flex-1">
          {days.map((day, i) => {
            const today = isToday(day);
            return (
              <div
                key={i}
                className={`text-center py-2 ${i < 6 ? "border-r border-gray-800/30" : ""}`}
              >
                <div className="text-[11px] uppercase text-gray-500">{DAY_NAMES[i]}</div>
                <button
                  onClick={() => onDayClick(day)}
                  className={`text-sm mt-0.5 ${
                    today
                      ? "bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto"
                      : "text-gray-300 hover:text-white"
                  }`}
                >
                  {day.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* All-day bar */}
      {hasAnyAllDay && (
        <div className="flex border-b border-gray-800/40">
          <div className="w-12 shrink-0 flex items-center">
            <span className="text-[11px] text-gray-500 w-12 text-right pr-2">Journée</span>
          </div>
          <div className="grid grid-cols-7 flex-1">
            {allDayByDay.map((dayEvents, i) => (
              <div
                key={i}
                className={`p-1 min-h-[28px] ${i < 6 ? "border-r border-gray-800/30" : ""}`}
              >
                {dayEvents.map((event) => {
                  const colors = SOURCE_COLORS[event.source];
                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className={`${colors.bg} ${colors.border} border-l-2 rounded px-1 py-0.5 text-[10px] text-white truncate block w-full text-left cursor-pointer mb-0.5`}
                    >
                      {event.title}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable hour grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: totalHeight }}>
          {/* Hour labels */}
          <div className="w-12 shrink-0">
            {HOURS.map((hour) => (
              <div key={hour} className="h-[60px] flex items-start">
                <span className="text-[11px] text-gray-600 w-12 text-right pr-2 -translate-y-[7px]">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* 7 day columns */}
          <div className="grid grid-cols-7 flex-1 relative">
            {/* Hour grid lines (shared across columns) */}
            {HOURS.map((hour, i) => (
              <div key={hour}>
                <div
                  className="border-t border-gray-800/40 absolute left-0 right-0"
                  style={{ top: i * HOUR_HEIGHT }}
                />
                <div
                  className="border-t border-gray-800/20 border-dashed absolute left-0 right-0"
                  style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
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

            {/* Day columns */}
            {days.map((day, colIndex) => (
              <div
                key={colIndex}
                className={`relative ${colIndex < 6 ? "border-r border-gray-800/30" : ""}`}
                style={{ height: totalHeight }}
              >
                {eventsByDay[colIndex].map((event) => {
                  const top = getEventTop(event.start, START_HOUR, HOUR_HEIGHT);
                  const height = getEventHeight(event.start, event.end, HOUR_HEIGHT);
                  const colors = SOURCE_COLORS[event.source];
                  return (
                    <div
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className={`absolute ${colors.bg} ${colors.border} rounded-md px-1 py-0.5 border-l-2 cursor-pointer overflow-hidden z-10`}
                      style={{ top, height, width: "calc(100% - 2px)", left: 0 }}
                    >
                      <div className="text-[10px] font-medium text-white truncate">{event.title}</div>
                      <div className="text-[9px] text-gray-400 font-mono">
                        {formatTime(event.start)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
