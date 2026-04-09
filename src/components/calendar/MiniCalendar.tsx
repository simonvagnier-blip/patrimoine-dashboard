"use client";

import { useState } from "react";
import { isToday, isSameDay, getDaysInMonth, startOfWeek, addDays, formatMonthYear } from "./utils";
import type { CalendarEvent } from "./types";

interface MiniCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  events: CalendarEvent[];
}

const DAY_NAMES = ["lu", "ma", "me", "je", "ve", "sa", "di"];

export default function MiniCalendar({ selectedDate, onSelectDate, events }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(new Date(selectedDate));

  const monthDays = getDaysInMonth(viewMonth);
  const firstDay = monthDays[0];
  const startGrid = startOfWeek(firstDay);

  // Build 6 weeks grid
  const gridDays: Date[] = [];
  const d = new Date(startGrid);
  for (let i = 0; i < 42; i++) {
    gridDays.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  function hasEvents(date: Date): boolean {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return events.some((e) => e.start.startsWith(key));
  }

  function prevMonth() {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  }

  return (
    <div className="hidden lg:block w-52 shrink-0 bg-[#0d1117] rounded-lg p-3">
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-gray-500 hover:text-white text-sm p-1">&lt;</button>
        <span className="text-xs font-medium text-gray-300 capitalize">{formatMonthYear(viewMonth)}</span>
        <button onClick={nextMonth} className="text-gray-500 hover:text-white text-sm p-1">&gt;</button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-[10px] text-gray-600 text-center font-medium">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0">
        {gridDays.map((day, i) => {
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          const hasEvt = hasEvents(day);

          return (
            <button
              key={i}
              onClick={() => onSelectDate(day)}
              className={`relative w-7 h-7 flex flex-col items-center justify-center text-[11px] rounded-full transition-colors ${
                today
                  ? "bg-blue-500 text-white font-bold"
                  : selected && !today
                    ? "ring-1 ring-blue-500 text-white"
                    : inMonth
                      ? "text-gray-300 hover:bg-[#161b22]"
                      : "text-gray-700"
              }`}
            >
              {day.getDate()}
              {hasEvt && !today && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-gray-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
