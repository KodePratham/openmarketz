import type { MetadataRoute } from "next";
import { readCachedDiscoveredMarkets } from "@/lib/server/marketDiscoveryCache";
import { getSiteUrl } from "@/lib/server/siteUrl";

export const dynamic = "force-dynamic";

const MAX_SITEMAP_MARKETS = 50_000;
const SITEMAP_MARKETS_TIMEOUT_MS = 8_000;

function staticRoutes(baseUrl: string): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/create`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/open`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/my-markets`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const entries = staticRoutes(baseUrl);

  try {
    const marketResult = await Promise.race([
      readCachedDiscoveredMarkets(MAX_SITEMAP_MARKETS),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SITEMAP_MARKETS_TIMEOUT_MS);
      }),
    ]);

    if (!marketResult) {
      return entries;
    }

    const { markets, meta } = marketResult;

    for (const market of markets) {
      const closeTimeMs = market.closeTime > 0 ? market.closeTime * 1000 : 0;
      const stillOpen = closeTimeMs > Date.now();

      entries.push({
        url: `${baseUrl}/amm/${market.openCode}`,
        lastModified: closeTimeMs > 0 ? new Date(closeTimeMs) : new Date(meta.generatedAt),
        changeFrequency: stillOpen ? "hourly" : "weekly",
        priority: stillOpen ? 0.8 : 0.65,
      });
    }
  } catch (error) {
    console.error("sitemap generation failed for dynamic markets", error);
  }

  return entries;
}
