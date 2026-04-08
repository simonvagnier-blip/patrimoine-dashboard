import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

// GET: redirects to Google OAuth2 authorization page
export async function GET() {
  const url = getAuthUrl();
  return NextResponse.redirect(url);
}
