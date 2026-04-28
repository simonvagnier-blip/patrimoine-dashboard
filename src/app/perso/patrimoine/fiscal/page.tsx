import { computeFiscalSummary } from "@/lib/fiscal";
import { db, schema } from "@/lib/db";
import FiscalClient from "./FiscalClient";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  // Préchargé côté serveur pour le SSR initial — le client refresh ensuite
  // si l'utilisateur édite son profil.
  const summary = await computeFiscalSummary();
  const envelopes = await db.select().from(schema.envelopes).all();
  return (
    <FiscalClient
      initialSummary={summary}
      envelopes={envelopes.map((e) => ({ id: e.id, name: e.name, type: e.type }))}
    />
  );
}
