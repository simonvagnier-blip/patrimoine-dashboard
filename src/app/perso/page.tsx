import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchAppleCalendarEvents } from "@/lib/apple-calendar";

export const dynamic = "force-dynamic";

export default async function PersoHome() {
  const positions = await db.select().from(schema.positions).all();
  const patrimoineTotal = positions.reduce((sum, p) => {
    if (p.manual_value) return sum + p.manual_value;
    if (p.quantity && p.pru) return sum + p.quantity * p.pru;
    return sum;
  }, 0);

  const persoTasks = await db.select().from(schema.tasks).where(eq(schema.tasks.space, "perso")).all();
  const todoTasks = persoTasks.filter((t) => t.status !== "done");
  const habits = await db.select().from(schema.habits).where(eq(schema.habits.space, "perso")).all();
  const activeHabits = habits.filter((h) => h.active);

  // Fetch upcoming Apple Calendar events
  let upcomingEvents: Array<{ title: string; start: string; allDay: boolean }> = [];
  const appleUrl = process.env.APPLE_CALDAV_URL;
  const appleUser = process.env.APPLE_CALDAV_USERNAME;
  const applePass = process.env.APPLE_CALDAV_PASSWORD;
  if (appleUrl && appleUser && applePass) {
    try {
      const now2 = new Date();
      const nextWeek = new Date(now2.getTime() + 14 * 86400000);
      const events = await fetchAppleCalendarEvents(appleUrl, appleUser, applePass, now2, nextWeek);
      upcomingEvents = events.slice(0, 5).map((e) => ({ title: e.title, start: e.start, allDay: e.allDay }));
    } catch { /* calendar not connected */ }
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bonjour" : now.getHours() < 18 ? "Bon après-midi" : "Bonsoir";

  function formatEventTime(start: string, allDay: boolean): string {
    if (allDay) return "Journée";
    const d = new Date(start);
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting} Simon</h1>
          <p className="text-gray-400 text-sm mt-1">Espace personnel</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/perso/patrimoine">
            <Card className="bg-[#0d1117] border-gray-800 hover:border-emerald-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Patrimoine</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-400 font-[family-name:var(--font-jetbrains)]">
                  {patrimoineTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/perso/tasks">
            <Card className="bg-[#0d1117] border-gray-800 hover:border-emerald-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Tâches</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white font-[family-name:var(--font-jetbrains)]">{todoTasks.length}</p>
                <p className="text-xs text-gray-500 mt-1">en cours</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/perso/habits">
            <Card className="bg-[#0d1117] border-gray-800 hover:border-emerald-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Habitudes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white font-[family-name:var(--font-jetbrains)]">{activeHabits.length}</p>
                <p className="text-xs text-gray-500 mt-1">habitudes actives</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/perso/budget">
            <Card className="bg-[#0d1117] border-gray-800 hover:border-emerald-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Budget</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Commencer le suivi</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/perso/agenda">
            <Card className="bg-[#0d1117] border-gray-800 hover:border-emerald-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Agenda</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Apple Calendar</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/perso/notes">
            <Card className="bg-[#0d1117] border-gray-800 hover:border-emerald-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Journal & notes</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Upcoming calendar events */}
        {upcomingEvents.length > 0 && (
          <Card className="bg-[#0d1117] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Prochains événements
                </div>
                <Link href="/perso/agenda" className="text-xs text-emerald-400 hover:text-emerald-300 font-normal">
                  Voir l&apos;agenda
                </Link>
              </CardTitle>
            </CardHeader>
            <Separator className="bg-gray-800" />
            <CardContent className="pt-3 space-y-2">
              {upcomingEvents.map((evt, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <div className="w-1 h-8 rounded-full bg-emerald-500 shrink-0" />
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
      </div>
    </main>
  );
}
