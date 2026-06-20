import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { hashSecret, randomToken, TOKEN_TTL_MS, verifyPkce } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * Token endpoint (RFC 6749 §4.1.3 + RFC 7636 PKCE).
 *
 * Accepte uniquement grant_type=authorization_code. Échange le code contre
 * un access_token. Le code est marqué comme `used` immédiatement (single-use).
 *
 * Body x-www-form-urlencoded :
 *   grant_type=authorization_code
 *   code=<le code reçu>
 *   redirect_uri=<doit matcher celui du authorize>
 *   client_id=<>
 *   code_verifier=<PKCE>            ← obligatoire
 *   client_secret=<>                ← seulement si confidential client
 */
export async function POST(req: NextRequest) {
  // Body peut être en form-urlencoded ou en JSON selon le client
  let body: Record<string, string> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } else if (ct.includes("application/json")) {
    body = (await req.json()) as Record<string, string>;
  } else {
    // Best-effort : essayer form
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  }

  const grantType = body.grant_type;
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const clientId = body.client_id;
  const codeVerifier = body.code_verifier;
  const clientSecret = body.client_secret;

  if (grantType !== "authorization_code") {
    return errResponse("unsupported_grant_type", `grant_type must be 'authorization_code'`);
  }
  if (!code) return errResponse("invalid_request", "code required");
  if (!redirectUri) return errResponse("invalid_request", "redirect_uri required");
  if (!clientId) return errResponse("invalid_request", "client_id required");
  if (!codeVerifier) return errResponse("invalid_request", "code_verifier required (PKCE)");

  // Charge le client
  const client = await db
    .select()
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.client_id, clientId))
    .get();
  if (!client) return errResponse("invalid_client", "unknown client_id");

  // Authentification confidentielle si secret_hash en base
  if (client.client_secret_hash) {
    if (!clientSecret) {
      return errResponse("invalid_client", "client_secret required for this client");
    }
    if (hashSecret(clientSecret) !== client.client_secret_hash) {
      return errResponse("invalid_client", "wrong client_secret");
    }
  }

  // Charge le code, vérifie validité
  const codeRow = await db
    .select()
    .from(schema.oauthCodes)
    .where(and(eq(schema.oauthCodes.code, code), eq(schema.oauthCodes.client_id, clientId)))
    .get();
  if (!codeRow) return errResponse("invalid_grant", "code unknown or wrong client");
  if (codeRow.used) return errResponse("invalid_grant", "code already used");
  if (codeRow.expires_at < Date.now()) {
    return errResponse("invalid_grant", "code expired");
  }
  if (codeRow.redirect_uri !== redirectUri) {
    return errResponse("invalid_grant", "redirect_uri mismatch");
  }

  // PKCE
  if (!codeRow.pkce_challenge || !codeRow.pkce_method) {
    return errResponse("invalid_grant", "no PKCE challenge stored");
  }
  if (!verifyPkce(codeVerifier, codeRow.pkce_challenge, codeRow.pkce_method)) {
    return errResponse("invalid_grant", "PKCE verification failed");
  }

  // Marque le code comme utilisé
  await db
    .update(schema.oauthCodes)
    .set({ used: 1 })
    .where(eq(schema.oauthCodes.code, code))
    .run();

  // Émet un access token
  const accessToken = randomToken(48);
  const now = Date.now();
  await db
    .insert(schema.oauthTokens)
    .values({
      token: accessToken,
      client_id: clientId,
      scope: codeRow.scope,
      expires_at: now + TOKEN_TTL_MS,
      created_at: new Date().toISOString(),
    })
    .run();

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(TOKEN_TTL_MS / 1000),
    scope: codeRow.scope ?? "mcp",
  });
}

function errResponse(code: string, description: string, status = 400): NextResponse {
  return NextResponse.json(
    { error: code, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
