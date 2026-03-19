import { NextRequest, NextResponse } from "next/server";
import { forceRefreshProtocolStats } from "@/lib/server/protocolStatsCache";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.STATS_CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  return headerSecret === secret || bearerSecret === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await forceRefreshProtocolStats();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("POST /api/stats/refresh failed", error);
    const message = error instanceof Error ? error.message : "Unknown refresh error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
