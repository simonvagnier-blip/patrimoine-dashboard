import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

// GET: returns the OAuth2 authorization URL
export async function GET() {
  const url = getAuthUrl();
  return NextResponse.json({ url });
}
