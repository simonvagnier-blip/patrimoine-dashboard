import webpush from "web-push";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Web Push (C3) — envoi de notifications aux PWA installées.
 * Gratuit : VAPID + transport APNs/FCM, aucune plateforme tierce.
 * Confidentialité : messages volontairement SANS montants détaillés par
 * défaut (le contenu transite par Apple/Google) — le mode discret de l'app
 * ne doit pas être contourné par une notification.
 */

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

function configured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export async function sendPushToAll(
  payload: PushPayload
): Promise<{ sent: number; removed: number; error?: string }> {
  if (!configured()) return { sent: 0, removed: 0, error: "VAPID non configuré" };
  webpush.setVapidDetails(
    "mailto:simon.vagnier@gmail.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const subs = await db.select().from(schema.pushSubscriptions).all();
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 = subscription morte (désinstallation, révocation iOS) → purge.
      if (status === 404 || status === 410) {
        await db
          .delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.endpoint, sub.endpoint))
          .run();
        removed++;
      } else {
        console.error("push send failed:", status, (err as Error).message);
      }
    }
  }
  return { sent, removed };
}
