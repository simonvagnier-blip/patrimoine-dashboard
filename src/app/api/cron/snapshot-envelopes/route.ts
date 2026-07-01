import { NextRequest, NextResponse } from "next/server";
import { snapshotAllEnvelopes } from "@/lib/envelope-snapshots";
import { runIbkrSync } from "@/lib/ibkr-flex";
import { db, schema } from "@/lib/db";
import { eq, lt, or } from "drizzle-orm";

// Snapshots + purge + sync IBKR : le Flex Web Service peut prendre ~30 s.
export const maxDuration = 120;

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

    // Hygiène OAuth : purge des access tokens expirés et des codes
    // d'autorisation consommés ou périmés (expires_at en unix ms). Sans ça,
    // ils s'accumulent indéfiniment dans la base.
    const nowMs = Date.now();
    await db
      .delete(schema.oauthTokens)
      .where(lt(schema.oauthTokens.expires_at, nowMs))
      .run();
    await db
      .delete(schema.oauthCodes)
      .where(
        or(
          lt(schema.oauthCodes.expires_at, nowMs),
          eq(schema.oauthCodes.used, 1),
        ),
      )
      .run();

    // Sync IBKR quotidien (piggyback : Vercel hobby limite à 2 crons).
    // No-op propre si IBKR_FLEX_TOKEN/QUERY_ID ne sont pas configurés.
    let ibkr: Awaited<ReturnType<typeof runIbkrSync>> | { error: string };
    try {
      ibkr = await runIbkrSync();
    } catch (err) {
      ibkr = { error: (err as Error).message };
    }

    return NextResponse.json({ ok: true, ...result, ibkr });
  } catch (err) {
    console.error("snapshot-envelopes cron failed:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
