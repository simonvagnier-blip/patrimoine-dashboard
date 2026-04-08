import { db, schema } from "@/lib/db";
import ProjectionsClient from "./ProjectionsClient";

export const dynamic = "force-dynamic";

export default async function ProjectionsPage() {
  const envelopes = await db.select().from(schema.envelopes).all();
  const positions = await db.select().from(schema.positions).all();
  const scenarioParams = await db.select().from(schema.scenarioParams).all();
  const userParamsRows = await db.select().from(schema.userParams).all();

  const userParams: Record<string, string> = {};
  for (const p of userParamsRows) {
    userParams[p.key] = p.value;
  }

  return (
    <ProjectionsClient
      envelopes={envelopes}
      positions={positions}
      scenarioParams={scenarioParams}
      userParams={userParams}
    />
  );
}
