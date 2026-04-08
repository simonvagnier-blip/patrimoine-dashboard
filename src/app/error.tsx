"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#080c14] flex items-center justify-center p-4">
      <Card className="bg-[#0d1117] border-gray-800 max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="text-4xl">&#9888;</div>
          <h2 className="text-xl font-bold text-white">
            Une erreur est survenue
          </h2>
          <p className="text-sm text-gray-400">
            {error.message || "Erreur inattendue. Veuillez réessayer."}
          </p>
          <Button
            onClick={reset}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Réessayer
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
