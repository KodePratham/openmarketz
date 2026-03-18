import { NextResponse } from "next/server";
import { readProtocolStats } from "@/lib/server/protocolStatsCache";

export async function GET() {
  try {
    const payload = await readProtocolStats();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/stats failed", error);
    const message = error instanceof Error ? error.message : "Unknown stats error";

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
