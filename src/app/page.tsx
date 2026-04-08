import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

function formatEur(v: number) {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default async function HomePage() {
  const allTasks = await db.select().from(schema.tasks).all();
  const deals = await db.select().from(schema.deals).all();
  const positions = await db.select().from(schema.positions).all();
  const habits = await db.select().from(schema.habits).all();
  const today = new Date().toISOString().split("T")[0];
  const habitLogs = await db.select().from(schema.habitLogs).all();
  const todayLogs = habitLogs.filter((l) => l.date === today);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bonjour" : now.getHours() < 18 ? "Bon après-midi" : "Bonsoir";

  // Tasks analysis
  const overdueTasks = allTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today);
  const todayTasks = allTasks.filter((t) => t.status !== "done" && t.due_date === today);
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress");
  const upcomingTasks = allTasks
    .filter((t) => t.status !== "done" && t.due_date && t.due_date > today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 5);

  // Pipeline
  const activeDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const hotDeals = activeDeals
    .sort((a, b) => ((b.value ?? 0) * b.probability) - ((a.value ?? 0) * a.probability))
    .slice(0, 3);
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.value ?? 0), 0);

  // Patrimoine
  const patrimoineTotal = positions.reduce((sum, p) => {
    if (p.manual_value) return sum + p.manual_value;
    if (p.quantity && p.pru) return sum + p.quantity * p.pru;
    return sum;
  }, 0);

  // Habits
  const activeHabits = habits.filter((h) => h.active && h.space === "perso");
  const completedHabits = activeHabits.filter((h) => todayLogs.some((l) => l.habit_id === h.id));

  const STAGE_LABELS: Record<string, string> = {
    lead: "Lead", qualified: "Qualifié", proposal: "Proposition", negotiation: "Négociation",
  };

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting} Simon</h1>
          <p className="text-gray-400 text-sm mt-1">
            {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* R14: Overdue tasks — TOP PRIORITY */}
        {overdueTasks.length > 0 && (
          <Card className="bg-red-900/10 border-red-800/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <p className="text-sm font-medium text-red-400">En retard ({overdueTasks.length})</p>
              </div>
              <div className="space-y-2">
                {overdueTasks.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ color: t.space === "pro" ? "#3b82f6" : "#34d399", borderColor: t.space === "pro" ? "#3b82f640" : "#34d39940" }}>
                      {t.space}
                    </Badge>
                    <span className="text-white flex-1 truncate">{t.title}</span>
                    <span className="text-red-400 text-xs font-[family-name:var(--font-jetbrains)]">{t.due_date?.slice(5)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Tasks */}
          <div className="space-y-4">
            {/* Today's tasks + in progress */}
            <Card className="bg-[#0d1117] border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">
                  Tâches du jour
                  <span className="text-xs text-gray-500 font-normal ml-2">
                    ({todayTasks.length + inProgressTasks.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[...inProgressTasks, ...todayTasks].length === 0 && (
                  <p className="text-gray-500 text-xs py-3 text-center">Rien de prévu pour aujourd&apos;hui</p>
                )}
                {[...inProgressTasks, ...todayTasks].slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === "in_progress" ? "bg-yellow-400" : "bg-gray-400"}`} />
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0" style={{ color: t.space === "pro" ? "#3b82f6" : "#34d399" }}>
                      {t.space === "pro" ? "P" : "~"}
                    </Badge>
                    <span className="text-sm text-gray-300 flex-1 truncate">{t.title}</span>
                  </div>
                ))}
                <Link href="/perso/tasks" className="text-xs text-gray-500 hover:text-gray-300 block text-center pt-1">
                  Voir toutes les tâches
                </Link>
              </CardContent>
            </Card>

            {/* Upcoming */}
            {upcomingTasks.length > 0 && (
              <Card className="bg-[#0d1117] border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-400">À venir</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {upcomingTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 py-1 text-sm">
                      <span className="text-xs text-gray-600 font-[family-name:var(--font-jetbrains)] w-12">{t.due_date?.slice(5)}</span>
                      <span className="text-gray-400 flex-1 truncate">{t.title}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Habits today */}
            {activeHabits.length > 0 && (
              <Card className="bg-[#0d1117] border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-white">
                    Habitudes
                    <span className="text-xs text-gray-500 font-normal ml-2">
                      {completedHabits.length}/{activeHabits.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {activeHabits.map((h) => {
                      const done = completedHabits.some((c) => c.id === h.id);
                      return (
                        <span key={h.id} className={`text-xs px-2.5 py-1 rounded-full ${done ? "text-white" : "text-gray-500 border border-gray-700"}`}
                          style={done ? { backgroundColor: h.color + "30", color: h.color } : {}}>
                          {done ? "\u2713 " : ""}{h.name}
                        </span>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column: Pro + Patrimoine */}
          <div className="space-y-4">
            {/* F8: Hero patrimoine card */}
            <Link href="/perso/patrimoine">
              <Card className="bg-[#0d1117] border-gray-800 hover:border-emerald-800/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400 mb-1">Patrimoine</p>
                  <p className="text-2xl font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">
                    {formatEur(patrimoineTotal)}
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Pipeline deals chauds */}
            <Card className="bg-[#0d1117] border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white flex items-center justify-between">
                  <span>Pipeline</span>
                  <span className="text-xs text-blue-400 font-[family-name:var(--font-jetbrains)] font-normal">{formatEur(pipelineValue)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {hotDeals.length === 0 && (
                  <p className="text-gray-500 text-xs py-2 text-center">Aucun deal actif</p>
                )}
                {hotDeals.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 py-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-400 border-blue-400/30 shrink-0">
                      {STAGE_LABELS[d.stage] || d.stage}
                    </Badge>
                    <span className="text-sm text-gray-300 flex-1 truncate">{d.title}</span>
                    <span className="text-xs text-blue-400 font-[family-name:var(--font-jetbrains)]">{formatEur(d.value ?? 0)}</span>
                  </div>
                ))}
                <Link href="/pro/pipeline" className="text-xs text-gray-500 hover:text-gray-300 block text-center pt-1">
                  Voir le pipeline
                </Link>
              </CardContent>
            </Card>

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/perso/budget">
                <Card className="bg-[#0d1117] border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
                  <CardContent className="p-3">
                    <p className="text-xs text-gray-400">Budget</p>
                    <p className="text-sm text-gray-500 mt-1">Suivi mensuel</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/pro/kpis">
                <Card className="bg-[#0d1117] border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
                  <CardContent className="p-3">
                    <p className="text-xs text-gray-400">KPIs Pro</p>
                    <p className="text-sm text-gray-500 mt-1">Objectifs</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
