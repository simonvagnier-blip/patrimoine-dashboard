import { db, schema } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const envelopes = await db.select().from(schema.envelopes).all();
  const positions = await db.select().from(schema.positions).all();
  const tasksPending = await db.select().from(schema.tasks).all();
  const todayTasks = tasksPending.filter((t) => t.status !== "done");
  const proTasks = todayTasks.filter((t) => t.space === "pro").length;
  const persoTasks = todayTasks.filter((t) => t.space === "perso").length;

  // Patrimoine total (rough calc from PRU)
  const patrimoineTotal = positions.reduce((sum, p) => {
    if (p.manual_value) return sum + p.manual_value;
    if (p.quantity && p.pru) return sum + p.quantity * p.pru;
    return sum;
  }, 0);

  const deals = await db.select().from(schema.deals).all();
  const activeDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.value ?? 0), 0);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bonjour" : now.getHours() < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting} Simon</h1>
          <p className="text-gray-400 text-sm mt-1">
            {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Perso Card */}
          <Link href="/perso">
            <Card className="bg-[#0d1117] border-gray-800 hover:border-emerald-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Espace Perso
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Patrimoine</span>
                  <span className="text-white font-[family-name:var(--font-jetbrains)]">
                    {patrimoineTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Tâches en cours</span>
                  <span className="text-white font-[family-name:var(--font-jetbrains)]">{persoTasks}</span>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Pro Card */}
          <Link href="/pro">
            <Card className="bg-[#0d1117] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-blue-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  Espace Pro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Pipeline</span>
                  <span className="text-white font-[family-name:var(--font-jetbrains)]">
                    {activeDeals.length} deal{activeDeals.length > 1 ? "s" : ""} — {pipelineValue.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Tâches en cours</span>
                  <span className="text-white font-[family-name:var(--font-jetbrains)]">{proTasks}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}
