import { kv } from "@vercel/kv";
import { discoverMarkets, type DiscoveredMarket, type DiscoveredMarketsSnapshot } from "@/lib/server/marketDiscovery";

const MARKETS_CACHE_KEY = "seo:markets:v1";
const MARKETS_CACHE_TTL_SECONDS = 30 * 60;
const MARKETS_CACHE_TTL_MS = MARKETS_CACHE_TTL_SECONDS * 1000;

type MarketsCacheSource = "kv" | "memory" | "live";

type MarketsCacheRecord = DiscoveredMarketsSnapshot;

export type ReadMarketsResult = {
  markets: DiscoveredMarket[];
  meta: {
    source: MarketsCacheSource;
    stale: boolean;
    generatedAt: string;
    latestBlock: number;
  };
};

let memoryRecord: MarketsCacheRecord | null = null;
let inFlightRefresh: Promise<MarketsCacheRecord> | null = null;

function hasKvConfig(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function isStale(generatedAt: string): boolean {
  const generatedAtMs = new Date(generatedAt).getTime();
  if (Number.isNaN(generatedAtMs)) return true;
  return Date.now() - generatedAtMs > MARKETS_CACHE_TTL_MS;
}

async function readKvRecord(): Promise<MarketsCacheRecord | null> {
  if (!hasKvConfig()) return null;

  try {
    return await kv.get<MarketsCacheRecord>(MARKETS_CACHE_KEY);
  } catch (error) {
    console.error("KV read failed for markets cache", error);
    return null;
  }
}

async function writeKvRecord(record: MarketsCacheRecord): Promise<void> {
  if (!hasKvConfig()) return;

  try {
    await kv.set(MARKETS_CACHE_KEY, record, { ex: MARKETS_CACHE_TTL_SECONDS });
  } catch (error) {
    console.error("KV write failed for markets cache", error);
  }
}

async function computeAndPersist(): Promise<MarketsCacheRecord> {
  const fresh = await discoverMarkets();
  memoryRecord = fresh;
  await writeKvRecord(fresh);
  return fresh;
}

function startRefresh(): Promise<MarketsCacheRecord> {
  if (!inFlightRefresh) {
    inFlightRefresh = computeAndPersist().finally(() => {
      inFlightRefresh = null;
    });
  }

  return inFlightRefresh;
}

async function readCachedRecord(): Promise<{ record: MarketsCacheRecord | null; source: MarketsCacheSource }> {
  const kvRecord = await readKvRecord();
  if (kvRecord) {
    memoryRecord = kvRecord;
    return { record: kvRecord, source: "kv" };
  }

  if (memoryRecord) {
    return { record: memoryRecord, source: "memory" };
  }

  return { record: null, source: "memory" };
}

export async function readDiscoveredMarkets(limit = 5000): Promise<ReadMarketsResult> {
  const { record, source } = await readCachedRecord();

  if (!record) {
    const fresh = await startRefresh();
    return {
      markets: fresh.markets.slice(0, limit),
      meta: {
        source: "live",
        stale: false,
        generatedAt: fresh.generatedAt,
        latestBlock: fresh.latestBlock,
      },
    };
  }

  const stale = isStale(record.generatedAt);
  if (stale) {
    void startRefresh();
  }

  return {
    markets: record.markets.slice(0, limit),
    meta: {
      source,
      stale,
      generatedAt: record.generatedAt,
      latestBlock: record.latestBlock,
    },
  };
}

export async function forceRefreshDiscoveredMarkets(limit = 5000): Promise<ReadMarketsResult> {
  const fresh = await startRefresh();

  return {
    markets: fresh.markets.slice(0, limit),
    meta: {
      source: "live",
      stale: false,
      generatedAt: fresh.generatedAt,
      latestBlock: fresh.latestBlock,
    },
  };
}

export async function readCachedDiscoveredMarkets(limit = 5000): Promise<ReadMarketsResult | null> {
  const { record, source } = await readCachedRecord();
  if (!record) return null;

  return {
    markets: record.markets.slice(0, limit),
    meta: {
      source,
      stale: isStale(record.generatedAt),
      generatedAt: record.generatedAt,
      latestBlock: record.latestBlock,
    },
  };
}
