import { NextRequest, NextResponse } from "next/server";
import { snapshotAllEnvelopes } from "@/lib/envelope-snapshots";
import { runIbkrSync } from "@/lib/ibkr-flex";
import { sendPushToAll } from "@/lib/push";
import { db, schema } from "@/lib/db";
import { desc, eq, lt, or } from "drizzle-orm";

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

    // Digest push quotidien : variation du jour en % UNIQUEMENT (pas de
    // montants — le contenu transite par APNs, cohérent avec le mode discret).
    let push: Awaited<ReturnType<typeof sendPushToAll>> | { skipped: string } = { skipped: "no data" };
    try {
      const snaps = await db
        .select()
        .from(schema.snapshots)
        .orderBy(desc(schema.snapshots.date))
        .limit(2)
        .all();
      if (snaps.length === 2 && snaps[1].total_value > 0) {
        const pct = ((snaps[0].total_value - snaps[1].total_value) / snaps[1].total_value) * 100;
        const arrow = pct >= 0 ? "▲" : "▼";
        push = await sendPushToAll({
          title: `Patrimoine ${arrow} ${pct >= 0 ? "+" : ""}${pct.toFixed(2)} %`,
          body: `Variation vs ${snaps[1].date}. Ouvre l'app pour le détail.`,
          url: "/perso/patrimoine",
        });
      }
    } catch (err) {
      push = { skipped: (err as Error).message };
    }

    return NextResponse.json({ ok: true, ...result, ibkr, push });
  } catch (err) {
    console.error("snapshot-envelopes cron failed:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
