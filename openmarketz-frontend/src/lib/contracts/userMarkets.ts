import { getAmmReadContract } from "@/lib/contracts/openmarketzAmm";

export type UserMarketCard = {
  id: bigint;
  code: string;
  question: string;
  closeTime: bigint;
  status: number;
};

type SerializableMarketCard = {
  id: string;
  code: string;
  question: string;
  closeTime: string;
  status: number;
};

type CachedPortfolio = {
  created: SerializableMarketCard[];
  invested: SerializableMarketCard[];
  cachedAtMs: number;
  latestBlock: number;
};

type Portfolio = {
  created: UserMarketCard[];
  invested: UserMarketCard[];
  latestBlock: number;
  fromCache: boolean;
};

type LoadOptions = {
  forceRefresh?: boolean;
};

const CACHE_TTL_MS = 15_000;
const CACHE_PREFIX = "openmarketz.ammPortfolio.v1.";

function cacheKey(address: string): string {
  return `${CACHE_PREFIX}${address.toLowerCase()}`;
}

function toSerializable(input: UserMarketCard): SerializableMarketCard {
  return {
    id: input.id.toString(),
    code: input.code,
    question: input.question,
    closeTime: input.closeTime.toString(),
    status: input.status,
  };
}

function fromSerializable(input: SerializableMarketCard): UserMarketCard {
  return {
    id: BigInt(input.id),
    code: input.code,
    question: input.question,
    closeTime: BigInt(input.closeTime),
    status: input.status,
  };
}

function readCachedPortfolio(address: string): Portfolio | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(cacheKey(address));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedPortfolio;
    if (!parsed.cachedAtMs || Date.now() - parsed.cachedAtMs > CACHE_TTL_MS) {
      return null;
    }

    return {
      created: parsed.created.map(fromSerializable),
      invested: parsed.invested.map(fromSerializable),
      latestBlock: parsed.latestBlock,
      fromCache: true,
    };
  } catch {
    return null;
  }
}

function writeCachedPortfolio(address: string, payload: Omit<Portfolio, "fromCache">): void {
  if (typeof window === "undefined") return;

  const serializable: CachedPortfolio = {
    created: payload.created.map(toSerializable),
    invested: payload.invested.map(toSerializable),
    latestBlock: payload.latestBlock,
    cachedAtMs: Date.now(),
  };

  window.sessionStorage.setItem(cacheKey(address), JSON.stringify(serializable));
}

export async function loadUserAmmPortfolio(address: string, options: LoadOptions = {}): Promise<Portfolio> {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error("Wallet address is invalid.");
  }

  if (!options.forceRefresh) {
    const cached = readCachedPortfolio(normalized);
    if (cached) {
      return cached;
    }
  }

  const read = getAmmReadContract();
  const runner = read.runner as unknown;
  const latestBlock =
    runner && typeof (runner as { getBlockNumber?: unknown }).getBlockNumber === "function"
      ? await (runner as { getBlockNumber: () => Promise<number> }).getBlockNumber()
      : 0;

  const [createdIdsRaw, participatedIdsRaw] = await Promise.all([
    read.getCreatedMarkets(normalized),
    read.getParticipatedMarkets(normalized),
  ]);

  const createdIds = createdIdsRaw.map((id: bigint) => BigInt(id));
  const createdSet = new Set(createdIds.map((id: bigint) => id.toString()));

  const investedIds = Array.from<string>(new Set(participatedIdsRaw.map((id: bigint) => BigInt(id).toString())))
    .filter((id) => !createdSet.has(id))
    .map((id) => BigInt(id));

  async function hydrate(ids: bigint[]): Promise<UserMarketCard[]> {
    const markets = await Promise.all(
      ids.map(async (id) => {
        const market = await read.getMarket(id);
        const code = await read.formatOpenCode(market.code);

        return {
          id,
          code,
          question: market.question,
          closeTime: market.closeTime,
          status: Number(market.status),
        } satisfies UserMarketCard;
      }),
    );

    return markets.sort((a, b) => Number(b.id - a.id));
  }

  const [created, invested] = await Promise.all([hydrate(createdIds), hydrate(investedIds)]);

  const payload = { created, invested, latestBlock };
  writeCachedPortfolio(normalized, payload);

  return {
    ...payload,
    fromCache: false,
  };
}
