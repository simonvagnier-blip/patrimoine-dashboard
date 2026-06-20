/**
 * Jeton de session SIGNÉ (HMAC-SHA256) — remplace le cookie `session_valid=true`
 * statique (forgeable par quiconque). Le proxy (middleware) vérifie la signature :
 * un cookie posé à la main sans la clé secrète est rejeté.
 *
 * Format du jeton : `base64url(payloadJSON).base64url(hmac)`
 *   payload = { exp: <epoch ms> }
 *
 * 100% Web Crypto + APIs standard (TextEncoder/btoa/atob) → fonctionne aussi
 * bien dans la route Node (`/api/auth`) que dans le proxy (runtime Node.js par
 * défaut en Next 16). Clé HMAC = `DASHBOARD_PASSWORD` (déjà secret, mono-user ;
 * si le mot de passe change, les sessions existantes sont invalidées — voulu).
 */

const encoder = new TextEncoder();

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const strToB64url = (s: string): string => bytesToB64url(encoder.encode(s));
const b64urlToStr = (s: string): string => new TextDecoder().decode(b64urlToBytes(s));

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(sig);
}

/** Comparaison à temps constant (anti timing-attack). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 jours

/** Émet un jeton de session signé, valide `ttlMs` à partir de maintenant. */
export async function createSessionToken(
  secret: string,
  ttlMs: number = SESSION_TTL_MS,
): Promise<string> {
  const payload = strToB64url(JSON.stringify({ exp: Date.now() + ttlMs }));
  const sig = bytesToB64url(await hmacSha256(secret, payload));
  return `${payload}.${sig}`;
}

/**
 * Vérifie un jeton : signature HMAC valide ET non expiré. Renvoie false pour
 * tout jeton absent, malformé, falsifié ou périmé (fail-closed).
 */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let given: Uint8Array;
  try {
    given = b64urlToBytes(sig);
  } catch {
    return false;
  }
  const expected = await hmacSha256(secret, payload);
  if (!timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(b64urlToStr(payload)) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}
