import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import EnvelopeDetailClient from "./EnvelopeDetailClient";

export const dynamic = "force-dynamic";

export default async function EnvelopeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const envelope = await db
    .select()
    .from(schema.envelopes)
    .where(eq(schema.envelopes.id, id))
    .get();

  if (!envelope) notFound();

  const positions = await db
    .select()
    .from(schema.positions)
    .where(eq(schema.positions.envelope_id, id))
    .all();

  return (
    <EnvelopeDetailClient envelope={envelope} initialPositions={positions} />
  );
}
