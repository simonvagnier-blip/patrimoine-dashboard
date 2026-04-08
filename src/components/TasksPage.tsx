"use client";

import { useState, useEffect, useCallback } from "react";
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
  created_at: string;
}

const STATUSES = [
  { key: "todo", label: "À faire", color: "#6b7280" },
  { key: "in_progress", label: "En cours", color: "#fbbf24" },
  { key: "done", label: "Terminé", color: "#34d399" },
];

const PRIORITIES = [
  { key: "low", label: "Basse", color: "#6b7280" },
  { key: "medium", label: "Moyenne", color: "#3b82f6" },
  { key: "high", label: "Haute", color: "#f59e0b" },
  { key: "urgent", label: "Urgent", color: "#ef4444" },
];

export default function TasksPage({ space }: { space: "pro" | "perso" }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [filter, setFilter] = useState<string | null>(null);
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
      body: JSON.stringify({ space, title: newTitle.trim() }),
    });
    setNewTitle("");
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

  async function deleteTask(id: number) {
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    fetchTasks();
  }

  async function updatePriority(id: number, priority: string) {
    await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, priority }),
    });
    fetchTasks();
  }

  const filteredTasks = filter ? tasks.filter((t) => t.status === filter) : tasks;
  const bgColor = space === "pro" ? "bg-[#0a0f1e]" : "bg-[#080c14]";
  const cardBg = space === "pro" ? "bg-[#0d1220]" : "bg-[#0d1117]";

  return (
    <main className={`min-h-screen ${bgColor} p-4 md:p-8`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Tâches</h1>
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

        {/* Quick add */}
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Nouvelle tâche..."
            className={`${cardBg} border-gray-700 text-white flex-1`}
          />
          <Button onClick={addTask} style={{ backgroundColor: config.color }} className="text-white hover:opacity-90">
            Ajouter
          </Button>
        </div>

        {/* Kanban View */}
        {view === "kanban" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUSES.map((status) => {
              const statusTasks = tasks.filter((t) => t.status === status.key);
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
                      return (
                        <Card key={task.id} className={`${cardBg} border-gray-800`}>
                          <CardContent className="p-3 space-y-2">
                            <p className="text-sm text-white">{task.title}</p>
                            {task.description && <p className="text-xs text-gray-500">{task.description}</p>}
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
                                <button onClick={() => deleteTask(task.id)} className="text-[10px] text-gray-600 hover:text-red-400 px-1">
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
              <div className="flex gap-2 mb-4">
                <Badge variant={filter === null ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setFilter(null)}>Toutes</Badge>
                {STATUSES.map((s) => (
                  <Badge key={s.key} variant={filter === s.key ? "default" : "outline"} className="cursor-pointer text-xs"
                    style={filter === s.key ? { backgroundColor: s.color + "20", color: s.color } : { color: "#6b7280" }}
                    onClick={() => setFilter(filter === s.key ? null : s.key)}>
                    {s.label}
                  </Badge>
                ))}
              </div>
              {filteredTasks.length === 0 && <p className="text-gray-500 text-sm py-4 text-center">Aucune tâche</p>}
              {filteredTasks.map((task) => {
                const pri = PRIORITIES.find((p) => p.key === task.priority);
                const sta = STATUSES.find((s) => s.key === task.status);
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
                    {task.due_date && (
                      <span className="text-[10px] text-gray-500 font-[family-name:var(--font-jetbrains)]">{task.due_date}</span>
                    )}
                    <select
                      value={task.priority}
                      onChange={(e) => updatePriority(task.id, e.target.value)}
                      className="bg-transparent text-[10px] text-gray-500 border-none outline-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    <button onClick={() => deleteTask(task.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                      &#10005;
                    </button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
