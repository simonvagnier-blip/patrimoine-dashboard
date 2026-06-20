import { db, schema } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";
import crypto from "node:crypto";

/**
 * Helpers OAuth 2.1 communs aux différents endpoints.
 *
 * Conventions :
 *   - Codes d'autorisation : 10 minutes de durée de vie, single-use
 *   - Access tokens : 30 jours, sans refresh (le client peut re-faire un flow)
 *   - PKCE obligatoire pour les public clients (claude.ai en est un)
 *   - client_secret hashé en SHA-256 avant stockage
 */

export const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
export const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 jours

export function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/**
 * Vérifie un code_verifier PKCE contre un code_challenge stocké.
 * Méthode S256 uniquement (la seule recommandée par OAuth 2.1).
 */
export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (method !== "S256") return false;
  return sha256(verifier) === challenge;
}

/**
 * Cherche un access token valide en base. Renvoie le token si valide, null sinon.
 * Filtre déjà les tokens expirés.
 */
export async function findValidToken(token: string) {
  const now = Date.now();
  const row = await db
    .select()
    .from(schema.oauthTokens)
    .where(and(eq(schema.oauthTokens.token, token), gt(schema.oauthTokens.expires_at, now)))
    .get();
  return row ?? null;
}

/**
 * Vérifie si une URL est dans la liste des redirect_uris autorisées d'un client.
 */
export function isRedirectAllowed(uri: string, allowed: string[]): boolean {
  return allowed.includes(uri);
}

/**
 * Construit le HTML de la page de consentement OAuth. Volontairement
 * minimaliste — juste un input password (le DASHBOARD_PASSWORD) + un bouton.
 *
 * Préserve tous les paramètres OAuth dans des hidden inputs pour qu'ils soient
 * passés au POST.
 */
export function renderConsentPage(params: {
  clientName: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  responseType: string;
  errorMessage?: string;
}): string {
  const safe = (s: string) => String(s).replace(/[<>&"']/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
  }[c] ?? c));
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Autoriser ${safe(params.clientName)} — Patrimoine Dashboard</title>
<style>
  * { box-sizing: border-box }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #080c14; color: #e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; padding: 1.5rem }
  .card { background: #0d1117; border: 1px solid #1f2937; border-radius: 12px; padding: 2rem; max-width: 420px; width: 100% }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem }
  p { color: #94a3b8; font-size: .9rem; margin: 0 0 1.25rem; line-height: 1.5 }
  .client { background: #161b22; border-radius: 8px; padding: .75rem 1rem; margin-bottom: 1.25rem;
            display: flex; align-items: center; gap: .75rem }
  .client strong { color: #e2e8f0 }
  .client small { color: #64748b; font-size: .75rem; word-break: break-all }
  .scopes { font-size: .8rem; color: #94a3b8; margin: 0 0 1rem; padding-left: 1rem }
  .scopes li { margin-bottom: .25rem }
  label { display: block; font-size: .75rem; color: #64748b; margin-bottom: .25rem; text-transform: uppercase; letter-spacing: .05em }
  input[type=password] { width: 100%; padding: .65rem .85rem; background: #161b22; border: 1px solid #1f2937;
                         border-radius: 8px; color: #e2e8f0; font-size: .9rem; margin-bottom: 1rem }
  input[type=password]:focus { outline: none; border-color: #34d399 }
  button { width: 100%; padding: .75rem; background: #059669; border: none; border-radius: 8px;
           color: white; font-weight: 500; cursor: pointer; font-size: .9rem }
  button:hover { background: #047857 }
  .err { background: #7f1d1d40; border: 1px solid #b91c1c80; color: #fca5a5; padding: .65rem .85rem;
         border-radius: 8px; margin-bottom: 1rem; font-size: .85rem }
</style>
</head><body>
<form method="POST" action="/api/oauth/authorize" class="card">
  <h1>Autoriser un nouveau connecteur</h1>
  <p>Une application demande à accéder à ton dashboard patrimoine en lecture seule via MCP.</p>
  <div class="client">
    <div>
      <strong>${safe(params.clientName)}</strong><br />
      <small>${safe(params.clientId)}</small>
    </div>
  </div>
  <ul class="scopes">
    <li>Lire ton patrimoine, positions, allocation</li>
    <li>Lire ton budget et tes opérations</li>
    <li>Simuler des projections (read-only)</li>
  </ul>
  ${params.errorMessage ? `<div class="err">${safe(params.errorMessage)}</div>` : ""}
  <label for="pw">Mot de passe du dashboard</label>
  <input id="pw" type="password" name="password" required autofocus autocomplete="current-password" />
  <input type="hidden" name="client_id" value="${safe(params.clientId)}" />
  <input type="hidden" name="redirect_uri" value="${safe(params.redirectUri)}" />
  <input type="hidden" name="state" value="${safe(params.state)}" />
  <input type="hidden" name="scope" value="${safe(params.scope)}" />
  <input type="hidden" name="code_challenge" value="${safe(params.codeChallenge)}" />
  <input type="hidden" name="code_challenge_method" value="${safe(params.codeChallengeMethod)}" />
  <input type="hidden" name="response_type" value="${safe(params.responseType)}" />
  <button type="submit">Autoriser ${safe(params.clientName)}</button>
</form>
</body></html>`;
}
