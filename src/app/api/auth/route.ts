import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { createSessionToken, SESSION_TTL_MS } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Anti brute-force : après MAX_FAILURES mots de passe erronés dans la fenêtre,
 * le login est verrouillé LOCK_MS. L'état vit dans user_params (clé unique) et
 * non en mémoire : sur Vercel, chaque instance serverless a sa propre mémoire,
 * seul un compteur en DB est réellement partagé. Mono-utilisateur → un
 * verrouillage global (pas par IP) est acceptable et plus simple.
 */
const THROTTLE_KEY = "loginThrottle";
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

interface ThrottleState {
  failures: number[]; // timestamps (ms) des échecs récents
  lockedUntil?: number;
}

async function readThrottle(): Promise<ThrottleState> {
  const row = await db
    .select()
    .from(schema.userParams)
    .where(eq(schema.userParams.key, THROTTLE_KEY))
    .get();
  if (!row) return { failures: [] };
  try {
    const parsed = JSON.parse(row.value) as ThrottleState;
    return { failures: parsed.failures ?? [], lockedUntil: parsed.lockedUntil };
  } catch {
    return { failures: [] };
  }
}

async function writeThrottle(state: ThrottleState | null): Promise<void> {
  const existing = await db
    .select()
    .from(schema.userParams)
    .where(eq(schema.userParams.key, THROTTLE_KEY))
    .get();
  if (state === null) {
    if (existing) {
      await db
        .delete(schema.userParams)
        .where(eq(schema.userParams.key, THROTTLE_KEY))
        .run();
    }
    return;
  }
  const value = JSON.stringify(state);
  if (existing) {
    await db
      .update(schema.userParams)
      .set({ value })
      .where(eq(schema.userParams.key, THROTTLE_KEY))
      .run();
  } else {
    await db.insert(schema.userParams).values({ key: THROTTLE_KEY, value }).run();
  }
}

/** Comparaison à temps constant via digests (gère les longueurs différentes). */
function passwordsMatch(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD not configured" },
      { status: 500 }
    );
  }

  const now = Date.now();
  const throttle = await readThrottle();
  if (throttle.lockedUntil && throttle.lockedUntil > now) {
    const retryAfterSec = Math.ceil((throttle.lockedUntil - now) / 1000);
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfterSec / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  if (typeof password !== "string" || !passwordsMatch(password, expected)) {
    const failures = [
      ...throttle.failures.filter((t) => t > now - WINDOW_MS),
      now,
    ];
    const locked = failures.length >= MAX_FAILURES;
    await writeThrottle({
      failures,
      lockedUntil: locked ? now + LOCK_MS : undefined,
    });
    if (locked) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans 15 min." },
        { status: 429, headers: { "Retry-After": String(LOCK_MS / 1000) } }
      );
    }
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  // Succès → remise à zéro du compteur d'échecs.
  await writeThrottle(null);

  // Jeton de session SIGNÉ (HMAC) — le proxy le vérifie. Remplace l'ancien
  // cookie `session_valid=true` statique qui était forgeable à la main.
  const token = await createSessionToken(expected, SESSION_TTL_MS);
  const cookieStore = await cookies();

  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000, // en secondes
    path: "/",
  });

  // Nettoie l'ancien cookie forgeable s'il traîne encore côté navigateur.
  cookieStore.set("session_valid", "", { maxAge: 0, path: "/" });

  return NextResponse.json({ success: true });
}
