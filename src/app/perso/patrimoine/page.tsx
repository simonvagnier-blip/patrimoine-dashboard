import { db, schema } from "@/lib/db";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const envelopes = await db.select().from(schema.envelopes).all();
  const positions = await db.select().from(schema.positions).all();

  return (
    <DashboardClient
      envelopes={envelopes}
      positions={positions}
      basePath="/perso/patrimoine"
    />
  );
}
