import { NextRequest, NextResponse } from "next/server";
import { forceRefreshDiscoveredMarkets, readDiscoveredMarkets } from "@/lib/server/marketDiscoveryCache";

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 5000;

function parseLimit(raw: string | null): number {
  const parsed = Number(raw || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

    const payload = force
      ? await forceRefreshDiscoveredMarkets(limit)
      : await readDiscoveredMarkets(limit);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("GET /api/markets failed", error);
    const message = error instanceof Error ? error.message : "Unknown markets error";

    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
