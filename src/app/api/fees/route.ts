import { NextResponse } from "next/server";
import { computeFees } from "@/lib/fees";

export const dynamic = "force-dynamic";

/** GET /api/fees — frais cumulés par enveloppe et par an (session). */
export async function GET() {
  const result = await computeFees();
  return NextResponse.json(result);
}
