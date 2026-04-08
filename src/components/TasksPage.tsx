"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SPACES } from "@/lib/spaces";

interface Task {
  id: number;
  space: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  recurrence: string | null;
  created_at: string;
}

interface PendingDelete {
  id: number;
  task: Task;
  timer: ReturnType<typeof setTimeout>;
}

const STATUSES = [
  { key: "todo", label: "A faire", color: "#6b7280" },
  { key: "in_progress", label: "En cours", color: "#fbbf24" },
  { key: "done", label: "Termin\u00e9", color: "#34d399" },
];

const PRIORITIES = [
  { key: "low", label: "Basse", color: "#6b7280" },
  { key: "medium", label: "Moyenne", color: "#3b82f6" },
  { key: "high", label: "Haute", color: "#f59e0b" },
  { key: "urgent", label: "Urgent", color: "#ef4444" },
];

const RECURRENCES = [
  { key: "", label: "\u2014" },
  { key: "daily", label: "Quotidien" },
  { key: "weekly", label: "Hebdo" },
  { key: "monthly", label: "Mensuel" },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  return due < todayStr();
}

function isToday(due: string | null): boolean {
  if (!due) return false;
  return due === todayStr();
}

function sortByDueDate(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // Overdue first, then soonest due date, then no due date last
    const aOverdue = isOverdue(a.due_date) ? 0 : 1;
    const bOverdue = isOverdue(b.due_date) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return 0;
  });
}

export default function TasksPage({ space }: { space: "pro" | "perso" }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newRecurrence, setNewRecurrence] = useState("");
  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [filter, setFilter] = useState<string | null>(null);
  const [todayFilter, setTodayFilter] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<PendingDelete[]>([]);
  const config = SPACES[space];

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?space=${space}`);
    if (res.ok) setTasks(await res.json());
  }, [space]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function addTask() {
    if (!newTitle.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ space, title: newTitle.trim(), due_date: newDueDate || null, recurrence: newRecurrence || null }),
    });
    setNewTitle("");
    setNewDueDate("");
    setNewRecurrence("");
    fetchTasks();
  }

  async function updateStatus(id: number, status: string) {
    await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchTasks();
  }

  // Soft delete: add to pending, actually delete after 5s
  function requestDeleteTask(id: number) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const timer = setTimeout(async () => {
      await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
      setPendingDeletes((prev) => prev.filter((pd) => pd.id !== id));
      fetchTasks();
    }, 5000);
    setPendingDeletes((prev) => [...prev, { id, task, timer }]);
    // Optimistically remove from visible tasks
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function undoDelete(id: number) {
    const pd = pendingDeletes.find((p) => p.id === id);
    if (!pd) return;
    clearTimeout(pd.timer);
    setPendingDeletes((prev) => prev.filter((p) => p.id !== id));
    // Restore the task
    setTasks((prev) => [...prev, pd.task]);
  }

  async function updatePriority(id: number, priority: string) {
    await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, priority }),
    });
    fetchTasks();
  }

  // Apply filters
  let displayTasks = filter ? tasks.filter((t) => t.status === filter) : tasks;
  if (todayFilter) {
    displayTasks = displayTasks.filter((t) => isToday(t.due_date) || isOverdue(t.due_date));
  }
  displayTasks = sortByDueDate(displayTasks);

  const bgColor = space === "pro" ? "bg-[#0a0f1e]" : "bg-[#080c14]";
  const cardBg = space === "pro" ? "bg-[#0d1220]" : "bg-[#0d1117]";

  return (
    <main className={`min-h-screen ${bgColor} p-4 md:p-8`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">T&acirc;ches</h1>
          <div className="flex gap-2">
            <Button variant={view === "kanban" ? "default" : "outline"} size="sm"
              onClick={() => setView("kanban")}
              className={view === "kanban" ? "bg-gray-700 text-white" : "border-gray-700 text-gray-400"}>
              Kanban
            </Button>
            <Button variant={view === "list" ? "default" : "outline"} size="sm"
              onClick={() => setView("list")}
              className={view === "list" ? "bg-gray-700 text-white" : "border-gray-700 text-gray-400"}>
              Liste
            </Button>
          </div>
        </div>

        {/* Quick add with due date */}
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Nouvelle t&acirc;che..."
            className={`${cardBg} border-gray-700 text-white flex-1`}
          />
          <Input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className={`${cardBg} border-gray-700 text-white w-40 text-sm`}
          />
          <select
            value={newRecurrence}
            onChange={(e) => setNewRecurrence(e.target.value)}
            className={`${cardBg} border border-gray-700 text-white rounded-md px-2 py-2 text-sm w-28`}
            title="R&eacute;currence"
          >
            {RECURRENCES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <Button onClick={addTask} style={{ backgroundColor: config.color }} className="text-white hover:opacity-90">
            Ajouter
          </Button>
        </div>

        {/* Kanban View */}
        {view === "kanban" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUSES.map((status) => {
              const statusTasks = sortByDueDate(tasks.filter((t) => t.status === status.key));
              return (
                <div key={status.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
                    <h3 className="text-sm font-medium text-gray-300">{status.label}</h3>
                    <span className="text-xs text-gray-500 font-[family-name:var(--font-jetbrains)]">{statusTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {statusTasks.map((task) => {
                      const pri = PRIORITIES.find((p) => p.key === task.priority);
                      const overdue = status.key !== "done" && isOverdue(task.due_date);
                      return (
                        <Card key={task.id} className={`${cardBg} border-gray-800`}>
                          <CardContent className="p-3 space-y-2">
                            <p className="text-sm text-white">{task.title}</p>
                            {task.description && <p className="text-xs text-gray-500">{task.description}</p>}
                            {task.due_date && (
                              <div className="flex items-center gap-1">
                                <span className={`text-[10px] font-[family-name:var(--font-jetbrains)] ${overdue ? "text-red-400" : "text-gray-500"}`}>
                                  {task.due_date}
                                </span>
                                {overdue && (
                                  <span className="text-[9px] bg-red-500/20 text-red-400 px-1 rounded">En retard</span>
                                )}
                              </div>
                            )}
                            {task.recurrence && (
                              <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                                &#8634; {RECURRENCES.find((r) => r.key === task.recurrence)?.label}
                              </span>
                            )}
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ color: pri?.color, borderColor: pri?.color + "40" }}>
                                {pri?.label}
                              </Badge>
                              <div className="flex gap-1">
                                {status.key !== "done" && (
                                  <button
                                    onClick={() => updateStatus(task.id, status.key === "todo" ? "in_progress" : "done")}
                                    className="text-[10px] text-gray-500 hover:text-white px-1"
                                  >
                                    {status.key === "todo" ? "Commencer" : "Terminer"}
                                  </button>
                                )}
                                <button onClick={() => requestDeleteTask(task.id)} className="text-[10px] text-gray-600 hover:text-red-400 px-1">
                                  Suppr.
                                </button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {view === "list" && (
          <Card className={`${cardBg} border-gray-800`}>
            <CardContent className="pt-4 space-y-1">
              {/* Filters */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <Badge variant={filter === null && !todayFilter ? "default" : "outline"} className="cursor-pointer text-xs"
                  onClick={() => { setFilter(null); setTodayFilter(false); }}>Toutes</Badge>
                {STATUSES.map((s) => (
                  <Badge key={s.key} variant={filter === s.key ? "default" : "outline"} className="cursor-pointer text-xs"
                    style={filter === s.key ? { backgroundColor: s.color + "20", color: s.color } : { color: "#6b7280" }}
                    onClick={() => { setFilter(filter === s.key ? null : s.key); setTodayFilter(false); }}>
                    {s.label}
                  </Badge>
                ))}
                <Badge
                  variant={todayFilter ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  style={todayFilter ? { backgroundColor: "#f59e0b20", color: "#f59e0b" } : { color: "#6b7280" }}
                  onClick={() => { setTodayFilter(!todayFilter); setFilter(null); }}
                >
                  Aujourd&apos;hui
                </Badge>
              </div>
              {displayTasks.length === 0 && <p className="text-gray-500 text-sm py-4 text-center">Aucune t&acirc;che</p>}
              {displayTasks.map((task) => {
                const pri = PRIORITIES.find((p) => p.key === task.priority);
                const sta = STATUSES.find((s) => s.key === task.status);
                const overdue = task.status !== "done" && isOverdue(task.due_date);
                return (
                  <div key={task.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-[#161b22] group">
                    <button
                      onClick={() => updateStatus(task.id, task.status === "done" ? "todo" : "done")}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        task.status === "done" ? "border-emerald-400 bg-emerald-400" : "border-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {task.status === "done" && <span className="text-[10px] text-white">&#10003;</span>}
                    </button>
                    <span className={`flex-1 text-sm ${task.status === "done" ? "line-through text-gray-500" : "text-white"}`}>
                      {task.title}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ color: pri?.color, borderColor: pri?.color + "40" }}>
                      {pri?.label}
                    </Badge>
                    {task.recurrence && (
                      <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                        &#8634; {RECURRENCES.find((r) => r.key === task.recurrence)?.label}
                      </span>
                    )}
                    {task.due_date && (
                      <span className={`text-[10px] font-[family-name:var(--font-jetbrains)] ${overdue ? "text-red-400" : "text-gray-500"}`}>
                        {task.due_date}
                      </span>
                    )}
                    {overdue && (
                      <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">En retard</span>
                    )}
                    <select
                      value={task.priority}
                      onChange={(e) => updatePriority(task.id, e.target.value)}
                      className="bg-transparent text-[10px] text-gray-500 border-none outline-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    <button onClick={() => requestDeleteTask(task.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                      &#10005;
                    </button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Delete undo toast */}
        {pendingDeletes.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
            {pendingDeletes.map((pd) => (
              <div key={pd.id} className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg">
                <span className="text-sm text-gray-300">T&acirc;che supprim&eacute;e</span>
                <button
                  onClick={() => undoDelete(pd.id)}
                  className="text-sm text-blue-400 hover:text-blue-300 font-medium underline"
                >
                  Annuler
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
