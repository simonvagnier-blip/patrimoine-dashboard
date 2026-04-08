import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bonjour" : now.getHours() < 18 ? "Bon après-midi" : "Bonsoir";

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
      </div>
    </main>
  );
}
