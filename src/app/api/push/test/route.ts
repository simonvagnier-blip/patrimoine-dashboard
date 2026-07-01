import { NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

/** POST — notification de test vers tous les appareils abonnés. Auth : session. */
export async function POST() {
  const result = await sendPushToAll({
    title: "Patrimoine 🔔",
    body: "Les notifications fonctionnent sur cet appareil.",
    url: "/perso/patrimoine",
  });
  return NextResponse.json(result);
}
