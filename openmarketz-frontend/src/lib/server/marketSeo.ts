import type { Metadata } from "next";
import { getAmmReadContract } from "@/lib/contracts/openmarketzAmm";
import { toAbsoluteUrl } from "@/lib/server/siteUrl";

const OPEN_CODE_PATTERN = /^OPEN\d{10}$/;
const NUMERIC_ID_PATTERN = /^\d+$/;

type MarketStatus = "OPEN" | "RESOLVED" | "CANCELED";

export type MarketSeoSnapshot = {
  marketId: string;
  openCode: string;
  question: string;
  description: string;
  closeTime: number;
  status: MarketStatus;
  yesPriceBps: number;
  noPriceBps: number;
};

function statusFromRaw(status: number): MarketStatus {
  if (status === 1) return "RESOLVED";
  if (status === 2) return "CANCELED";
  return "OPEN";
}

function sanitizeText(input: string, max = 220): string {
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

function asOpenCode(input: string): string | null {
  const normalized = input.trim().toUpperCase();
  if (!OPEN_CODE_PATTERN.test(normalized)) return null;
  return normalized;
}

function asNumericId(input: string): bigint | null {
  const normalized = input.trim();
  if (!NUMERIC_ID_PATTERN.test(normalized)) return null;

  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function closeDateLabel(closeTime: number): string {
  if (!closeTime) return "Unknown close time";
  return new Date(closeTime * 1000).toISOString().slice(0, 10);
}

export async function getMarketSeoSnapshot(marketParam: string): Promise<MarketSeoSnapshot | null> {
  try {
    const read = getAmmReadContract();
    const normalized = marketParam.trim();

    let marketId: bigint | null = null;

    const openCodeInput = asOpenCode(normalized);
    if (openCodeInput) {
      const resolved = await read.getMarketIdByOpenCode(openCodeInput);
      if (BigInt(resolved) === BigInt(0)) return null;
      marketId = BigInt(resolved);
    } else {
      marketId = asNumericId(normalized);
    }

    if (marketId === null || marketId < BigInt(1)) return null;

    const [market, yesPriceRaw, noPriceRaw] = await Promise.all([
      read.getMarket(marketId),
      read.getImpliedPriceBps(marketId, true),
      read.getImpliedPriceBps(marketId, false),
    ]);

    const openCode = await read.formatOpenCode(market.code);

    const question = sanitizeText(String(market.question || "Untitled market"), 140);
    const description = sanitizeText(
      String(market.description || "Trade this prediction market on Monad testnet."),
      280,
    );

    return {
      marketId: marketId.toString(),
      openCode,
      question,
      description,
      closeTime: Number(market.closeTime || 0),
      status: statusFromRaw(Number(market.status || 0)),
      yesPriceBps: Number(yesPriceRaw || 0),
      noPriceBps: Number(noPriceRaw || 0),
    };
  } catch (error) {
    console.error("getMarketSeoSnapshot failed", error);
    return null;
  }
}

export function getMarketMetadata(snapshot: MarketSeoSnapshot): Metadata {
  const title = `${snapshot.question}`;
  const oddsText = `YES ${(snapshot.yesPriceBps / 100).toFixed(2)}% | NO ${(snapshot.noPriceBps / 100).toFixed(2)}%`;
  const description = `${snapshot.description} ${oddsText} | Closes ${closeDateLabel(snapshot.closeTime)} | ${snapshot.openCode}`;
  const canonicalPath = `/amm/${snapshot.openCode}`;
  const ogImageUrl = toAbsoluteUrl(`/api/og?market=${snapshot.openCode}`);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type: "article",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${snapshot.openCode} market preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export function getMarketJsonLd(snapshot: MarketSeoSnapshot): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: snapshot.question,
    description: snapshot.description,
    eventStatus:
      snapshot.status === "OPEN"
        ? "https://schema.org/EventScheduled"
        : snapshot.status === "RESOLVED"
          ? "https://schema.org/EventCompleted"
          : "https://schema.org/EventCancelled",
    endDate: snapshot.closeTime ? new Date(snapshot.closeTime * 1000).toISOString() : undefined,
    location: {
      "@type": "VirtualLocation",
      url: toAbsoluteUrl(`/amm/${snapshot.openCode}`),
    },
    organizer: {
      "@type": "Organization",
      name: "OpenMarketz",
      url: toAbsoluteUrl("/"),
    },
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Market code",
        value: snapshot.openCode,
      },
      {
        "@type": "PropertyValue",
        name: "Market ID",
        value: snapshot.marketId,
      },
      {
        "@type": "PropertyValue",
        name: "YES odds",
        value: `${(snapshot.yesPriceBps / 100).toFixed(2)}%`,
      },
      {
        "@type": "PropertyValue",
        name: "NO odds",
        value: `${(snapshot.noPriceBps / 100).toFixed(2)}%`,
      },
    ],
  };
}
