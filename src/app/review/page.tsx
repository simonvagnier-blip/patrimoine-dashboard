import { db, schema } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatEur(v: number) {
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default async function WeeklyReview() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const weekAgoStr = weekAgo.toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  // Tasks
  const allTasks = await db.select().from(schema.tasks).all();
  const completedThisWeek = allTasks.filter((t) => t.completed_at && t.completed_at >= weekAgoStr);
  const overdue = allTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < todayStr);
  const createdThisWeek = allTasks.filter((t) => t.created_at >= weekAgoStr);
  const inProgress = allTasks.filter((t) => t.status === "in_progress");

  // Deals
  const deals = await db.select().from(schema.deals).all();
  const wonThisWeek = deals.filter((d) => d.stage === "won" && d.updated_at >= weekAgoStr);
  const lostThisWeek = deals.filter((d) => d.stage === "lost" && d.updated_at >= weekAgoStr);
  const activeDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.value ?? 0), 0);
  const wonValue = wonThisWeek.reduce((s, d) => s + (d.value ?? 0), 0);

  // Habits
  const habits = await db.select().from(schema.habits).all();
  const habitLogs = await db.select().from(schema.habitLogs).all();
  const weekLogs = habitLogs.filter((l) => l.date >= weekAgoStr && l.date <= todayStr);
  const activeHabits = habits.filter((h) => h.active);
  const totalPossible = activeHabits.length * 7;
  const totalCompleted = weekLogs.length;
  const completionRate = totalPossible > 0 ? (totalCompleted / totalPossible) * 100 : 0;

  // Budget
  const currentMonth = now.toISOString().slice(0, 7);
  const budgetEntries = await db.select().from(schema.budgetEntries).all();
  const monthEntries = budgetEntries.filter((e) => e.date.startsWith(currentMonth));
  const monthIncome = monthEntries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const monthExpenses = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);

  // Patrimoine
  const snapshots = await db.select().from(schema.snapshots).all();
  const recentSnapshot = snapshots.sort((a, b) => b.date.localeCompare(a.date))[0];
  const weekOldSnapshot = snapshots.find((s) => s.date <= weekAgoStr);
  const patrimoineChange = recentSnapshot && weekOldSnapshot
    ? recentSnapshot.total_value - weekOldSnapshot.total_value
    : null;

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Weekly Review</h1>
          <p className="text-gray-400 text-sm mt-1">
            Semaine du {weekAgo.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au {now.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>

        {/* Tasks summary */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white flex items-center gap-2">
              Tâches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">{completedThisWeek.length}</p>
                <p className="text-xs text-gray-500">terminées</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white font-[family-name:var(--font-jetbrains)]">{createdThisWeek.length}</p>
                <p className="text-xs text-gray-500">créées</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400 font-[family-name:var(--font-jetbrains)]">{inProgress.length}</p>
                <p className="text-xs text-gray-500">en cours</p>
              </div>
              <div>
                <p className={`text-2xl font-bold font-[family-name:var(--font-jetbrains)] ${overdue.length > 0 ? "text-red-400" : "text-gray-600"}`}>{overdue.length}</p>
                <p className="text-xs text-gray-500">en retard</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline summary */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-lg font-bold text-blue-400 font-[family-name:var(--font-jetbrains)]">{formatEur(pipelineValue)}</p>
                <p className="text-xs text-gray-500">actif</p>
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">{formatEur(wonValue)}</p>
                <p className="text-xs text-gray-500">{wonThisWeek.length} gagné{wonThisWeek.length > 1 ? "s" : ""}</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-400 font-[family-name:var(--font-jetbrains)]">{lostThisWeek.length}</p>
                <p className="text-xs text-gray-500">perdu{lostThisWeek.length > 1 ? "s" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Habits */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">Habitudes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-2xl font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">{completionRate.toFixed(0)}%</p>
                <p className="text-xs text-gray-500">complétion</p>
              </div>
              <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${completionRate}%` }} />
              </div>
              <p className="text-xs text-gray-500 font-[family-name:var(--font-jetbrains)]">{totalCompleted}/{totalPossible}</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {activeHabits.map((h) => {
                const count = weekLogs.filter((l) => l.habit_id === h.id).length;
                return (
                  <Badge key={h.id} variant="outline" className="text-xs" style={{ color: h.color, borderColor: h.color + "40" }}>
                    {h.name}: {count}/7
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Budget */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">Budget — {now.toLocaleDateString("fr-FR", { month: "long" })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-lg font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">{formatEur(monthIncome)}</p>
                <p className="text-xs text-gray-500">revenus</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-400 font-[family-name:var(--font-jetbrains)]">{formatEur(monthExpenses)}</p>
                <p className="text-xs text-gray-500">dépenses</p>
              </div>
              <div>
                <p className={`text-lg font-bold font-[family-name:var(--font-jetbrains)] ${monthIncome - monthExpenses >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatEur(monthIncome - monthExpenses)}
                </p>
                <p className="text-xs text-gray-500">épargne</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Patrimoine */}
        <Card className="bg-[#0d1117] border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">Patrimoine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {recentSnapshot && (
                <p className="text-2xl font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">
                  {formatEur(recentSnapshot.total_value)}
                </p>
              )}
              {patrimoineChange !== null && (
                <p className={`text-sm font-[family-name:var(--font-jetbrains)] ${patrimoineChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {patrimoineChange >= 0 ? "+" : ""}{formatEur(patrimoineChange)} cette semaine
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">
            Retour au dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
