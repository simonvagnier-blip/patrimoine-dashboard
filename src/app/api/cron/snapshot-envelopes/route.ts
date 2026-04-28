import { NextRequest, NextResponse } from "next/server";
import { snapshotAllEnvelopes } from "@/lib/envelope-snapshots";

export const dynamic = "force-dynamic";

/**
 * Nightly cron: capture per-envelope valuations into `envelope_snapshots`.
 *
 * Triggered by Vercel Cron (see vercel.json). Vercel sends the request with
 * `Authorization: Bearer $CRON_SECRET`, which we verify below. The route is
 * also callable manually with the same header, which is handy for backfilling
 * or on-demand snapshots.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await snapshotAllEnvelopes();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("snapshot-envelopes cron failed:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
