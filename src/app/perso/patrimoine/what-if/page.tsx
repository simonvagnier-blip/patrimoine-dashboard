import { db, schema } from "@/lib/db";
import WhatIfClient from "./WhatIfClient";

export const dynamic = "force-dynamic";

export default async function WhatIfPage() {
  const envelopes = await db.select().from(schema.envelopes).all();
  return (
    <WhatIfClient
      envelopes={envelopes.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        color: e.color,
      }))}
    />
  );
}
