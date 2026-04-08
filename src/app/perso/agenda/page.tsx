import { Card, CardContent } from "@/components/ui/card";

export default function PersoAgenda() {
  return (
    <main className="min-h-screen bg-[#080c14] p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-white">Agenda Perso</h1>
        <Card className="bg-[#0d1117] border-gray-800">
          <CardContent className="py-12 text-center space-y-4">
            <div className="text-4xl">&#128197;</div>
            <p className="text-gray-400">Intégration Apple Calendar (CalDAV)</p>
            <p className="text-xs text-gray-500">
              Configuration requise : URL CalDAV de ton compte iCloud.
              <br />
              Module en cours de développement.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
