import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "NOT SET",
    hasAppleUrl: !!process.env.APPLE_CALDAV_URL,
    hasAppleUser: !!process.env.APPLE_CALDAV_USERNAME,
    hasApplePass: !!process.env.APPLE_CALDAV_PASSWORD,
    hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}
