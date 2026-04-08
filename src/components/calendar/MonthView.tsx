"use client";

import { CalendarEvent, SOURCE_COLORS } from "./types";
import {
  getDaysInMonth,
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
  dateToKey,
  formatTime,
} from "./utils";

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MAX_VISIBLE_EVENTS = 3;

interface MonthViewProps {
  events: CalendarEvent[];
  month: Date;
  onDayClick: (date: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
}

export default function MonthView({ events, month, onDayClick, onEventClick }: MonthViewProps) {
  // Build the full calendar grid
  const monthDays = getDaysInMonth(month);
  const firstDay = monthDays[0];
  const gridStart = startOfWeek(firstDay);

  // Build 6 weeks of dates (42 cells max)
  const cells: Date[] = [];
  let current = new Date(gridStart);
  while (cells.length < 42) {
    cells.push(new Date(current));
    current = addDays(current, 1);
    // Stop after we've passed the last day of the month and filled the row
    if (cells.length >= 35 && current.getMonth() !== month.getMonth() && cells.length % 7 === 0) {
      break;
    }
  }

  // Group events by date key
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  events.forEach((event) => {
    const key = dateToKey(new Date(event.start));
    if (!eventsByDate[key]) eventsByDate[key] = [];
    eventsByDate[key].push(event);
  });

  const isCurrentMonth = (date: Date) => date.getMonth() === month.getMonth();

  return (
    <div className="flex flex-col h-full">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-gray-800/40">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-center py-2 text-[11px] uppercase text-gray-500 font-medium"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {cells.map((date, i) => {
          const key = dateToKey(date);
          const dayEvents = eventsByDate[key] || [];
          const inMonth = isCurrentMonth(date);
          const today = isToday(date);
          const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
          const extraCount = dayEvents.length - MAX_VISIBLE_EVENTS;

          return (
            <div
              key={key + "-" + i}
              className={`min-h-[60px] sm:min-h-[100px] p-1 border-b border-r border-gray-800/30 ${
                !inMonth ? "bg-gray-900/30" : ""
              }`}
            >
              {/* Day number */}
              <button
                onClick={() => onDayClick(date)}
                className={`text-xs mb-1 ${
                  today
                    ? "bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                    : inMonth
                    ? "text-gray-300 hover:text-white"
                    : "text-gray-700"
                }`}
              >
                {date.getDate()}
              </button>

              {/* Events - pills on desktop, dots on mobile */}
              <div className="hidden sm:block">
                {visibleEvents.map((event) => {
                  const colors = SOURCE_COLORS[event.source];
                  return (
                    <button
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className={`${colors.bg} rounded px-1 py-0.5 mb-0.5 text-[11px] truncate block w-full text-left cursor-pointer text-white`}
                    >
                      {event.allDay ? event.title : `${formatTime(event.start)} ${event.title}`}
                    </button>
                  );
                })}
                {extraCount > 0 && (
                  <button
                    onClick={() => onDayClick(date)}
                    className="text-[11px] text-gray-500 hover:text-gray-300 cursor-pointer"
                  >
                    +{extraCount} autres
                  </button>
                )}
              </div>

              {/* Mobile: colored dots */}
              <div className="sm:hidden flex gap-0.5 flex-wrap">
                {dayEvents.slice(0, 5).map((event) => {
                  const colors = SOURCE_COLORS[event.source];
                  return (
                    <div
                      key={event.id}
                      className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
