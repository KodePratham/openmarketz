import { kv } from "@vercel/kv";
import { getProtocolStats, type ProtocolStats } from "@/lib/contracts/protocolStats";

const STATS_CACHE_KEY = "protocol:stats:v1";
const STATS_CACHE_TTL_SECONDS = 24 * 60 * 60;
const STATS_CACHE_TTL_MS = STATS_CACHE_TTL_SECONDS * 1000;

type StatsCacheSource = "kv" | "memory" | "live";

type StatsCacheRecord = {
  stats: SerializedProtocolStats;
  refreshedAt: string;
};

export type SerializedProtocolStats = {
  totalMarkets: number;
  totalTransactions: number;
  totalVolumeWei: string;
  totalLiquidityWei: string;
  uniqueUsers: number;
  latestBlock: number;
  generatedAt: string;
  warnings: string[];
};

export type ReadStatsResult = {
  stats: SerializedProtocolStats;
  meta: {
    refreshedAt: string;
    stale: boolean;
    source: StatsCacheSource;
  };
};

let memoryRecord: StatsCacheRecord | null = null;
let inFlightRefresh: Promise<StatsCacheRecord> | null = null;

function hasKvConfig(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function toSerialized(stats: ProtocolStats): SerializedProtocolStats {
  return {
    totalMarkets: stats.totalMarkets,
    totalTransactions: stats.totalTransactions,
    totalVolumeWei: stats.totalVolumeWei.toString(),
    totalLiquidityWei: stats.totalLiquidityWei.toString(),
    uniqueUsers: stats.uniqueUsers,
    latestBlock: stats.latestBlock,
    generatedAt: stats.generatedAt.toISOString(),
    warnings: stats.warnings,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function isStale(refreshedAt: string): boolean {
  const refreshedMs = new Date(refreshedAt).getTime();
  if (Number.isNaN(refreshedMs)) return true;
  return Date.now() - refreshedMs > STATS_CACHE_TTL_MS;
}

async function readKvRecord(): Promise<StatsCacheRecord | null> {
  if (!hasKvConfig()) return null;

  try {
    return await kv.get<StatsCacheRecord>(STATS_CACHE_KEY);
  } catch (error) {
    console.error("KV read failed for protocol stats", error);
    return null;
  }
}

async function writeKvRecord(record: StatsCacheRecord): Promise<void> {
  if (!hasKvConfig()) return;

  try {
    await kv.set(STATS_CACHE_KEY, record, { ex: STATS_CACHE_TTL_SECONDS });
  } catch (error) {
    console.error("KV write failed for protocol stats", error);
  }
}

async function computeAndPersist(): Promise<StatsCacheRecord> {
  const fresh = toSerialized(await getProtocolStats());
  const nextRecord: StatsCacheRecord = {
    stats: fresh,
    refreshedAt: nowIso(),
  };

  memoryRecord = nextRecord;
  await writeKvRecord(nextRecord);
  return nextRecord;
}

function startRefresh(): Promise<StatsCacheRecord> {
  if (!inFlightRefresh) {
    inFlightRefresh = computeAndPersist().finally(() => {
      inFlightRefresh = null;
    });
  }

  return inFlightRefresh;
}

async function readCachedRecord(): Promise<{ record: StatsCacheRecord | null; source: StatsCacheSource }> {
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

export async function readProtocolStats(): Promise<ReadStatsResult> {
  const { record, source } = await readCachedRecord();

  if (!record) {
    const fresh = await startRefresh();
    return {
      stats: fresh.stats,
      meta: {
        refreshedAt: fresh.refreshedAt,
        stale: false,
        source: "live",
      },
    };
  }

  const stale = isStale(record.refreshedAt);
  if (stale) {
    // Refresh in background while still serving stale snapshot.
    void startRefresh();
  }

  return {
    stats: record.stats,
    meta: {
      refreshedAt: record.refreshedAt,
      stale,
      source,
    },
  };
}

export async function forceRefreshProtocolStats(): Promise<ReadStatsResult> {
  const fresh = await startRefresh();

  return {
    stats: fresh.stats,
    meta: {
      refreshedAt: fresh.refreshedAt,
      stale: false,
      source: "live",
    },
  };
}
