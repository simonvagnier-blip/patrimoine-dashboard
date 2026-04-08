import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { fetchAllQuotes, invalidateCache } from "@/lib/quotes";
import { isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "true";

  if (refresh) {
    invalidateCache();
  }

  // Get all yahoo tickers from DB
  const positions = await db
    .select({ yahoo_ticker: schema.positions.yahoo_ticker })
    .from(schema.positions)
    .where(isNotNull(schema.positions.yahoo_ticker))
    .all();

  const tickers = positions
    .map((p) => p.yahoo_ticker)
    .filter((t): t is string => t !== null);

  try {
    const data = await fetchAllQuotes(tickers);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch quotes:", error);
    return NextResponse.json(
      { error: "Failed to fetch quotes" },
      { status: 500 }
    );
  }
}
