import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { CODE_TTL_MS, randomToken, renderConsentPage } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * Authorization endpoint (RFC 6749 §4.1).
 *
 * GET  : valide les paramètres OAuth, charge le client, render le formulaire
 *        de consentement (HTML).
 * POST : valide le mot de passe (DASHBOARD_PASSWORD), génère un code, redirige
 *        vers le redirect_uri du client avec le code et le state.
 *
 * Single-user app : pas de notion d'identité utilisateur. Le mot de passe
 * authentifie l'utilisateur unique = propriétaire du dashboard.
 */

async function loadClient(clientId: string) {
  const row = await db
    .select()
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.client_id, clientId))
    .get();
  if (!row) return null;
  return {
    ...row,
    redirect_uris: JSON.parse(row.redirect_uris) as string[],
  };
}

function htmlError(message: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem;background:#080c14;color:#fca5a5"><h1>OAuth error</h1><p>${message}</p></body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("client_id") ?? "";
  const redirectUri = sp.get("redirect_uri") ?? "";
  const responseType = sp.get("response_type") ?? "";
  const state = sp.get("state") ?? "";
  const scope = sp.get("scope") ?? "mcp";
  const codeChallenge = sp.get("code_challenge") ?? "";
  const codeChallengeMethod = sp.get("code_challenge_method") ?? "";

  if (!clientId) return htmlError("client_id required");
  if (responseType !== "code") return htmlError(`response_type must be 'code' (got '${responseType}')`);
  if (!codeChallenge) return htmlError("PKCE code_challenge required");
  if (codeChallengeMethod !== "S256") return htmlError("code_challenge_method must be S256");

  const client = await loadClient(clientId);
  if (!client) return htmlError("unknown client_id");
  if (!client.redirect_uris.includes(redirectUri)) {
    return htmlError(`redirect_uri not registered: ${redirectUri}`);
  }

  return new NextResponse(
    renderConsentPage({
      clientName: client.client_name ?? "Client",
      clientId,
      redirectUri,
      state,
      scope,
      codeChallenge,
      codeChallengeMethod,
      responseType,
    }),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const scope = String(form.get("scope") ?? "mcp");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const codeChallengeMethod = String(form.get("code_challenge_method") ?? "S256");

  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  if (!expectedPassword) {
    return htmlError("Server misconfigured: DASHBOARD_PASSWORD not set");
  }

  const client = await loadClient(clientId);
  if (!client) return htmlError("unknown client_id");
  if (!client.redirect_uris.includes(redirectUri)) {
    return htmlError(`redirect_uri not registered: ${redirectUri}`);
  }

  // Mauvais mot de passe : re-render le formulaire avec un message d'erreur
  if (password !== expectedPassword) {
    return new NextResponse(
      renderConsentPage({
        clientName: client.client_name ?? "Client",
        clientId,
        redirectUri,
        state,
        scope,
        codeChallenge,
        codeChallengeMethod,
        responseType: "code",
        errorMessage: "Mot de passe incorrect.",
      }),
      { status: 401, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  // Génère un code à usage unique
  const code = randomToken(32);
  await db
    .insert(schema.oauthCodes)
    .values({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      pkce_challenge: codeChallenge,
      pkce_method: codeChallengeMethod,
      expires_at: Date.now() + CODE_TTL_MS,
      used: 0,
    })
    .run();

  // Redirige le user-agent vers le redirect_uri du client avec code + state
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString(), { status: 302 });
}
