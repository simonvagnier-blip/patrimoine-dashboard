import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { hashSecret, randomToken } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * RFC 7591 — Dynamic Client Registration.
 *
 * claude.ai POST ici en JSON pour s'enregistrer comme client OAuth. On
 * accepte tous les enregistrements (single-user app, le mot de passe du
 * dashboard est la vraie protection au moment de l'autorisation). Génère
 * un client_id + client_secret, persiste, et renvoie au format RFC.
 *
 * Body attendu (extrait — RFC 7591 a beaucoup de champs optionnels) :
 *   {
 *     "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
 *     "client_name": "Claude",
 *     "token_endpoint_auth_method": "client_secret_post" | "none"
 *   }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;

  const redirectUris = Array.isArray(body.redirect_uris)
    ? (body.redirect_uris as unknown[]).map(String)
    : [];
  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris required" },
      { status: 400 },
    );
  }
  // Validation basique : HTTPS uniquement (sauf localhost en dev)
  for (const u of redirectUris) {
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
        return NextResponse.json(
          { error: "invalid_redirect_uri", error_description: `non-HTTPS redirect_uri rejected: ${u}` },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "invalid_redirect_uri", error_description: `malformed URL: ${u}` },
        { status: 400 },
      );
    }
  }

  const authMethod = String(body.token_endpoint_auth_method ?? "client_secret_post");
  const isPublicClient = authMethod === "none";

  const clientId = randomToken(16);
  const clientSecret = isPublicClient ? null : randomToken(32);
  const clientName = String(body.client_name ?? "Custom Client");

  await db
    .insert(schema.oauthClients)
    .values({
      client_id: clientId,
      client_secret_hash: clientSecret ? hashSecret(clientSecret) : null,
      client_name: clientName,
      redirect_uris: JSON.stringify(redirectUris),
      created_at: new Date().toISOString(),
    })
    .run();

  // RFC 7591 réponse
  return NextResponse.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(clientSecret ? { client_secret_expires_at: 0 } : {}), // 0 = pas d'expiration
      redirect_uris: redirectUris,
      client_name: clientName,
      token_endpoint_auth_method: authMethod,
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}
