import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getCalendarEvents } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280", medium: "#3b82f6", high: "#f59e0b", urgent: "#ef4444",
};
const PRIORITY_LABELS: Record<string, string> = {
  low: "Basse", medium: "Moyenne", high: "Haute", urgent: "Urgent",
};

export default async function ProHome() {
  const proTasks = await db.select().from(schema.tasks).where(eq(schema.tasks.space, "pro")).all();
  const todoTasks = proTasks.filter((t) => t.status === "todo");
  const inProgressTasks = proTasks.filter((t) => t.status === "in_progress");
  const recentDone = proTasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 3);

  const deals = await db.select().from(schema.deals).all();
  const activeDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.value ?? 0), 0);
  const contacts = await db.select().from(schema.contacts).all();

  // Fetch upcoming Google Calendar events
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("google_access_token")?.value;
  const refreshToken = cookieStore.get("google_refresh_token")?.value;
  let upcomingEvents: Array<{ title: string; start: string; allDay: boolean }> = [];
  if (accessToken && refreshToken) {
    try {
      const now2 = new Date();
      const nextWeek = new Date(now2.getTime() + 14 * 86400000);
      const events = await getCalendarEvents(accessToken, refreshToken, now2.toISOString(), nextWeek.toISOString());
      upcomingEvents = events.slice(0, 5).map((e) => ({ title: e.title, start: e.start, allDay: e.allDay }));
    } catch { /* calendar not connected */ }
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bonjour" : now.getHours() < 18 ? "Bon après-midi" : "Bonsoir";

  function formatEur(v: number) {
    return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  }

  function formatEventTime(start: string, allDay: boolean): string {
    if (allDay) return "Journée";
    const d = new Date(start);
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <main className="min-h-screen bg-[#0a0f1e] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting} Simon</h1>
          <p className="text-gray-400 text-sm mt-1">Espace professionnel</p>
        </div>

        {/* Top row: CRM + Pipeline summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/pro/crm">
            <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 mb-1">CRM</p>
                <p className="text-2xl font-bold text-blue-400 font-[family-name:var(--font-jetbrains)]">{contacts.length}</p>
                <p className="text-xs text-gray-500">contacts</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/pro/pipeline">
            <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 mb-1">Pipeline</p>
                <p className="text-2xl font-bold text-blue-400 font-[family-name:var(--font-jetbrains)]">{formatEur(pipelineValue)}</p>
                <p className="text-xs text-gray-500">{activeDeals.length} deal{activeDeals.length > 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
          </Link>
          <div className="grid grid-cols-2 gap-4">
            <Link href="/pro/kpis">
              <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400 mb-1">KPIs</p>
                  <p className="text-sm text-gray-500">Objectifs</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/pro/agenda">
              <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400 mb-1">Agenda</p>
                  <p className="text-sm text-gray-500">Google Cal</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* Tasks detail section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* In progress */}
          <Card className="bg-[#0d1220] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                En cours
                <span className="text-xs text-gray-500 font-normal ml-1">({inProgressTasks.length})</span>
              </CardTitle>
            </CardHeader>
            <Separator className="bg-gray-800" />
            <CardContent className="pt-3 space-y-2">
              {inProgressTasks.length === 0 && (
                <p className="text-gray-500 text-xs py-3 text-center">Aucune tâche en cours</p>
              )}
              {inProgressTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                  <span className="text-sm text-white flex-1 truncate">{t.title}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0"
                    style={{ color: PRIORITY_COLORS[t.priority], borderColor: PRIORITY_COLORS[t.priority] + "40" }}>
                    {PRIORITY_LABELS[t.priority]}
                  </Badge>
                  {t.due_date && (
                    <span className="text-[10px] text-gray-500 font-[family-name:var(--font-jetbrains)] shrink-0">{t.due_date.slice(5)}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* To do */}
          <Card className="bg-[#0d1220] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                À faire
                <span className="text-xs text-gray-500 font-normal ml-1">({todoTasks.length})</span>
              </CardTitle>
            </CardHeader>
            <Separator className="bg-gray-800" />
            <CardContent className="pt-3 space-y-2">
              {todoTasks.length === 0 && (
                <p className="text-gray-500 text-xs py-3 text-center">Aucune tâche à faire</p>
              )}
              {todoTasks.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-4 h-4 rounded-full border-2 border-gray-600 shrink-0" />
                  <span className="text-sm text-gray-300 flex-1 truncate">{t.title}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0"
                    style={{ color: PRIORITY_COLORS[t.priority], borderColor: PRIORITY_COLORS[t.priority] + "40" }}>
                    {PRIORITY_LABELS[t.priority]}
                  </Badge>
                </div>
              ))}
              {todoTasks.length > 8 && (
                <Link href="/pro/tasks" className="text-xs text-blue-400 hover:text-blue-300 block text-center pt-2">
                  Voir les {todoTasks.length - 8} autres tâches
                </Link>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recently completed */}
        {recentDone.length > 0 && (
          <Card className="bg-[#0d1220] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Récemment terminées
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1 space-y-1">
              {recentDone.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center shrink-0">
                    <span className="text-[8px] text-white">&#10003;</span>
                  </span>
                  <span className="text-sm text-gray-500 line-through flex-1 truncate">{t.title}</span>
                  {t.completed_at && (
                    <span className="text-[10px] text-gray-600 font-[family-name:var(--font-jetbrains)]">
                      {new Date(t.completed_at).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Upcoming calendar events */}
        {upcomingEvents.length > 0 && (
          <Card className="bg-[#0d1220] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  Prochains RDV
                </div>
                <Link href="/pro/agenda" className="text-xs text-blue-400 hover:text-blue-300 font-normal">
                  Voir l&apos;agenda
                </Link>
              </CardTitle>
            </CardHeader>
            <Separator className="bg-gray-800" />
            <CardContent className="pt-3 space-y-2">
              {upcomingEvents.map((evt, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <div className="w-1 h-8 rounded-full bg-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{evt.title}</p>
                    <p className="text-[11px] text-gray-500 font-[family-name:var(--font-jetbrains)]">
                      {formatEventTime(evt.start, evt.allDay)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick links */}
        <div className="flex gap-3">
          <Link href="/pro/tasks">
            <button className="text-xs text-blue-400 hover:text-blue-300 bg-[#0d1220] border border-gray-800 rounded-lg px-4 py-2">
              Toutes les tâches
            </button>
          </Link>
          <Link href="/pro/notes">
            <button className="text-xs text-blue-400 hover:text-blue-300 bg-[#0d1220] border border-gray-800 rounded-lg px-4 py-2">
              Notes pro
            </button>
          </Link>
        </div>
      </div>
    </main>
  );
}
