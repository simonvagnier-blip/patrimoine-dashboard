import { NextRequest, NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/google-calendar";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// OAuth2 callback — exchanges code for tokens and stores them in cookies
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/pro/agenda?error=no_code", request.url));
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    const cookieStore = await cookies();

    if (tokens.access_token) {
      cookieStore.set("google_access_token", tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60, // 1 hour
        path: "/",
      });
    }

    if (tokens.refresh_token) {
      cookieStore.set("google_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: "/",
      });
    }

    return NextResponse.redirect(new URL("/pro/agenda?connected=true", request.url));
  } catch (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(new URL("/pro/agenda?error=auth_failed", request.url));
  }
}
