"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Habit {
  id: number;
  name: string;
  color: string;
  frequency: string; // 'daily' | 'weekly'
  target: number; // times per period
}

interface HabitLog {
  habit_id: number;
  date: string;
  count: number;
}

const DEFAULT_HABITS = [
  { name: "Sport", color: "#34d399", icon: null },
  { name: "Méditation", color: "#a78bfa", icon: null },
  { name: "Temps d'écran < 3h", color: "#f87171", icon: null },
  { name: "Lecture", color: "#3b82f6", icon: null },
  { name: "Hydratation 2L", color: "#38bdf8", icon: null },
  { name: "Sommeil 7h+", color: "#f59e0b", icon: null },
];

function getWeekDates(): string[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3);
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [newHabit, setNewHabit] = useState("");
  const [newFrequency, setNewFrequency] = useState<"daily" | "weekly">("daily");
  const [newTarget, setNewTarget] = useState(1);
  const weekDates = getWeekDates();
  const today = weekDates[weekDates.length - 1];

  const fetchData = useCallback(async () => {
    const [hRes, lRes] = await Promise.all([
      fetch("/api/habits?space=perso"),
      fetch(`/api/habit-logs?start=${weekDates[0]}&end=${today}`),
    ]);
    if (hRes.ok) setHabits(await hRes.json());
    if (lRes.ok) setLogs(await lRes.json());
  }, [today, weekDates[0]]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function toggleLog(habitId: number, date: string) {
    await fetch("/api/habit-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habit_id: habitId, date }),
    });
    fetchData();
  }

  function isLogged(habitId: number, date: string): boolean {
    return logs.some((l) => l.habit_id === habitId && l.date === date);
  }

  // Get the Monday of the week containing the given date
  function getWeekStart(dateStr: string): Date {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.getFullYear(), d.getMonth(), diff);
  }

  // Count logs in the current week for a habit
  function getWeekLogCount(habitId: number, dateStr: string): number {
    const weekStart = getWeekStart(dateStr);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = weekStart.toISOString().split("T")[0];
    const endStr = weekEnd.toISOString().split("T")[0];
    return logs.filter((l) => l.habit_id === habitId && l.date >= startStr && l.date <= endStr).length;
  }

  // Check if a habit is "on track" for today (frequency-aware)
  function isHabitOnTrack(habit: Habit): boolean {
    if (habit.frequency === "daily") {
      return isLogged(habit.id, today);
    }
    // Weekly: check if target reached this week
    return getWeekLogCount(habit.id, today) >= habit.target;
  }

  function getStreak(habit: Habit): number {
    let streak = 0;
    if (habit.frequency === "daily") {
      const d = new Date();
      for (let i = 0; i < 365; i++) {
        const dateStr = d.toISOString().split("T")[0];
        if (logs.some((l) => l.habit_id === habit.id && l.date === dateStr)) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else break;
      }
    } else {
      // Weekly streak: count consecutive weeks where target was met
      const d = new Date();
      for (let w = 0; w < 52; w++) {
        const weekStart = getWeekStart(d.toISOString().split("T")[0]);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const startStr = weekStart.toISOString().split("T")[0];
        const endStr = weekEnd.toISOString().split("T")[0];
        const count = logs.filter((l) => l.habit_id === habit.id && l.date >= startStr && l.date <= endStr).length;
        if (count >= habit.target) {
          streak++;
          d.setDate(d.getDate() - 7);
        } else break;
      }
    }
    return streak;
  }

  async function addHabit() {
    if (!newHabit.trim()) return;
    await fetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ space: "perso", name: newHabit.trim(), color: "#34d399", frequency: newFrequency, target: newTarget }),
    });
    setNewHabit("");
    setNewFrequency("daily");
    setNewTarget(1);
    fetchData();
  }

  async function seedDefaults() {
    for (const h of DEFAULT_HABITS) {
      await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ space: "perso", name: h.name, color: h.color, frequency: "daily", target: 1 }),
      });
    }
    fetchData();
  }

  const todayCompleted = habits.filter((h) => isHabitOnTrack(h)).length;

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Habitudes</h1>
            <p className="text-gray-400 text-sm mt-1">
              {todayCompleted}/{habits.length} aujourd&apos;hui
            </p>
          </div>
        </div>

        {habits.length === 0 ? (
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-gray-400">Aucune habitude configurée</p>
              <Button onClick={seedDefaults} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Ajouter les habitudes par défaut
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-[#0d1117] border-gray-800">
            <CardContent className="pt-4">
              {/* F5: Desktop week grid */}
              <div className="hidden sm:block">
                <div className="grid gap-2" style={{ gridTemplateColumns: "1fr repeat(7, 40px) 60px" }}>
                  <div />
                  {weekDates.map((d) => (
                    <div key={d} className={`text-center text-[10px] ${d === today ? "text-emerald-400 font-bold" : "text-gray-500"}`}>
                      {getDayLabel(d)}
                    </div>
                  ))}
                  <div className="text-center text-[10px] text-gray-500">Streak</div>
                </div>
                {habits.map((habit) => {
                  const streak = getStreak(habit);
                  return (
                    <div key={habit.id} className="grid gap-2 py-2 border-t border-gray-800 items-center"
                      style={{ gridTemplateColumns: "1fr repeat(7, 40px) 60px" }}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: habit.color }} />
                        <span className="text-sm text-white truncate">{habit.name}</span>
                        {habit.frequency === "weekly" && (
                          <span className="text-[9px] text-gray-500 shrink-0">{habit.target}x/sem</span>
                        )}
                        {habit.frequency === "daily" && habit.target > 1 && (
                          <span className="text-[9px] text-gray-500 shrink-0">{habit.target}x/j</span>
                        )}
                      </div>
                    {weekDates.map((d) => {
                      const logged = isLogged(habit.id, d);
                      return (
                        <button
                          key={d}
                          onClick={() => toggleLog(habit.id, d)}
                          className={`w-8 h-8 rounded-lg mx-auto flex items-center justify-center transition-all ${
                            logged
                              ? "text-white text-sm"
                              : "bg-[#161b22] hover:bg-[#1f2937] text-gray-700"
                          }`}
                          style={logged ? { backgroundColor: habit.color } : {}}
                        >
                          {logged ? "&#10003;" : ""}
                        </button>
                      );
                    })}
                    <div className="text-center">
                      {streak > 0 && (
                        <span className="text-xs font-[family-name:var(--font-jetbrains)]" style={{ color: habit.color }}>
                          {streak}{habit.frequency === "weekly" ? "sem" : "j"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>

              {/* F5: Mobile view — today only with swipe hint */}
              <div className="sm:hidden space-y-3">
                {habits.map((habit) => {
                  const streak = getStreak(habit);
                  const todayLogged = isLogged(habit.id, today);
                  return (
                    <div key={habit.id} className="flex items-center gap-3 py-2 border-t border-gray-800">
                      <button
                        onClick={() => toggleLog(habit.id, today)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                          todayLogged ? "text-white text-lg" : "bg-[#161b22] text-gray-700"
                        }`}
                        style={todayLogged ? { backgroundColor: habit.color } : {}}
                      >
                        {todayLogged ? "\u2713" : ""}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white">{habit.name}</span>
                        {habit.frequency === "weekly" && (
                          <span className="text-[9px] text-gray-500 ml-1">{getWeekLogCount(habit.id, today)}/{habit.target}</span>
                        )}
                        {streak > 0 && (
                          <span className="text-xs ml-2 font-[family-name:var(--font-jetbrains)]" style={{ color: habit.color }}>
                            {streak}{habit.frequency === "weekly" ? "sem" : "j"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add habit */}
        <div className="flex gap-2 flex-wrap">
          <Input value={newHabit} onChange={(e) => setNewHabit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHabit()}
            placeholder="Nouvelle habitude..." className="bg-[#0d1117] border-gray-700 text-white flex-1 min-w-[150px]" />
          <div className="flex items-center gap-1">
            <select
              value={newTarget}
              onChange={(e) => setNewTarget(parseInt(e.target.value))}
              className="bg-[#0d1117] border border-gray-700 text-white rounded-md px-2 py-2 text-sm w-16"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-gray-400 text-sm">fois /</span>
            <select
              value={newFrequency}
              onChange={(e) => setNewFrequency(e.target.value as "daily" | "weekly")}
              className="bg-[#0d1117] border border-gray-700 text-white rounded-md px-2 py-2 text-sm w-28"
            >
              <option value="daily">jour</option>
              <option value="weekly">semaine</option>
            </select>
          </div>
          <Button onClick={addHabit} className="bg-emerald-600 hover:bg-emerald-700 text-white">Ajouter</Button>
        </div>
      </div>
    </main>
  );
}
