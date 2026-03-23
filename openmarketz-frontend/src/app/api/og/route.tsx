import { ImageResponse } from "next/og";
import { getMarketSeoSnapshot } from "@/lib/server/marketSeo";

export const runtime = "nodejs";

function marketHeaderText(market: string | null): string {
  if (!market) return "OPEN0000000000";
  const normalized = market.trim().toUpperCase();
  return normalized || "OPEN0000000000";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const marketParam = searchParams.get("market");
  const fallbackCode = marketHeaderText(marketParam);
  const snapshot = marketParam ? await getMarketSeoSnapshot(marketParam) : null;

  const title = snapshot?.question || "Trade a prediction market on Monad";
  const code = snapshot?.openCode || fallbackCode;
  const yes = snapshot ? `${(snapshot.yesPriceBps / 100).toFixed(2)}%` : "--";
  const no = snapshot ? `${(snapshot.noPriceBps / 100).toFixed(2)}%` : "--";
  const closeAt = snapshot?.closeTime ? new Date(snapshot.closeTime * 1000).toISOString().slice(0, 10) : "Unknown";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background: "linear-gradient(140deg, #4f40ff 0%, #7259ff 45%, #8f7eff 100%)",
          color: "white",
          fontFamily: "Space Grotesk, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ fontSize: 30, fontWeight: 600, opacity: 0.9 }}>OpenMarketz on Monad</div>
          <div style={{ fontSize: 38, fontWeight: 700, maxWidth: "95%" }}>{title}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: 24, fontWeight: 500 }}>
            <div>{code}</div>
            <div>YES {yes}</div>
            <div>NO {no}</div>
          </div>
          <div style={{ fontSize: 20, opacity: 0.85 }}>Closes: {closeAt}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
