import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/** GET — clé publique VAPID (nécessaire à pushManager.subscribe). */
export async function GET() {
  const key = vapidPublicKey();
  if (!key) return NextResponse.json({ error: "VAPID non configuré" }, { status: 503 });
  return NextResponse.json({ publicKey: key });
}

/** POST — enregistre/rafraîchit une subscription push. Auth : session. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "subscription invalide" }, { status: 400 });
  }
  const existing = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint))
    .get();
  if (existing) {
    await db
      .update(schema.pushSubscriptions)
      .set({ p256dh, auth })
      .where(eq(schema.pushSubscriptions.endpoint, endpoint))
      .run();
  } else {
    await db.insert(schema.pushSubscriptions).values({ endpoint, p256dh, auth }).run();
  }
  return NextResponse.json({ success: true });
}

/** DELETE — désabonnement. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body?.endpoint !== "string") {
    return NextResponse.json({ error: "endpoint requis" }, { status: 400 });
  }
  await db
    .delete(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, body.endpoint))
    .run();
  return NextResponse.json({ success: true });
}
