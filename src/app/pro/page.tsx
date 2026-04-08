import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ProHome() {
  const proTasks = await db.select().from(schema.tasks).where(eq(schema.tasks.space, "pro")).all();
  const todoTasks = proTasks.filter((t) => t.status !== "done");
  const deals = await db.select().from(schema.deals).all();
  const activeDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.value ?? 0), 0);
  const contacts = await db.select().from(schema.contacts).all();

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bonjour" : now.getHours() < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <main className="min-h-screen bg-[#0a0f1e] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting} Simon</h1>
          <p className="text-gray-400 text-sm mt-1">Espace professionnel</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/pro/crm">
            <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">CRM</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-400 font-[family-name:var(--font-jetbrains)]">{contacts.length}</p>
                <p className="text-xs text-gray-500 mt-1">contacts</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/pro/pipeline">
            <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-400 font-[family-name:var(--font-jetbrains)]">
                  {pipelineValue.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-500 mt-1">{activeDeals.length} deal{activeDeals.length > 1 ? "s" : ""} actif{activeDeals.length > 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/pro/tasks">
            <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Tâches</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white font-[family-name:var(--font-jetbrains)]">{todoTasks.length}</p>
                <p className="text-xs text-gray-500 mt-1">en cours</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/pro/kpis">
            <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">KPIs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Objectifs du mois</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/pro/agenda">
            <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Agenda</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Google Calendar</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/pro/notes">
            <Card className="bg-[#0d1220] border-gray-800 hover:border-blue-800 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-400">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">Notes pro</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}
