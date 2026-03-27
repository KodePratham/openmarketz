import { Interface, JsonRpcProvider, id } from "ethers";
import { APP_RPC_URL, OPENMARKETZ_AMM_ADDRESS, openMarketzAmmAbi } from "@/lib/contracts/openmarketzAmm";

const DEFAULT_CHUNK_SIZE = 90;
const MIN_CHUNK_SIZE = 10;
const MAX_CHUNK_SIZE = 120;
const DEFAULT_START_BLOCK = 0;

export type DiscoveredMarket = {
  marketId: string;
  openCode: string;
  question: string;
  closeTime: number;
  blockNumber: number;
};

export type DiscoveredMarketsSnapshot = {
  generatedAt: string;
  latestBlock: number;
  markets: DiscoveredMarket[];
};

function parseStartBlock(): number {
  const raw = process.env.NEXT_PUBLIC_OPENMARKETZ_START_BLOCK;
  if (!raw) return DEFAULT_START_BLOCK;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_START_BLOCK;
  return Math.floor(parsed);
}

function formatOpenCode(code: bigint): string {
  return `OPEN${code.toString().padStart(10, "0")}`;
}

async function getLogsChunked(
  provider: JsonRpcProvider,
  address: string,
  topic0: string,
  fromBlock: number,
  toBlock: number,
) {
  if (toBlock < fromBlock) return [];

  const logs: Awaited<ReturnType<typeof provider.getLogs>> = [];
  let cursor = fromBlock;
  let chunkSize = DEFAULT_CHUNK_SIZE;

  while (cursor <= toBlock) {
    const end = Math.min(cursor + chunkSize - 1, toBlock);

    try {
      const chunk = await provider.getLogs({
        address,
        topics: [topic0],
        fromBlock: cursor,
        toBlock: end,
      });

      logs.push(...chunk);
      cursor = end + 1;

      if (chunkSize < MAX_CHUNK_SIZE) {
        chunkSize = Math.min(MAX_CHUNK_SIZE, chunkSize * 2);
      }
    } catch {
      if (chunkSize <= MIN_CHUNK_SIZE) {
        throw new Error(`Market scan failed near block ${cursor}`);
      }

      chunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(chunkSize / 2));
    }
  }

  return logs;
}

export async function discoverMarkets(): Promise<DiscoveredMarketsSnapshot> {
  if (!OPENMARKETZ_AMM_ADDRESS) {
    throw new Error("NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS is not set");
  }

  const provider = new JsonRpcProvider(APP_RPC_URL);
  const abi = new Interface(openMarketzAmmAbi);
  const latestBlock = await provider.getBlockNumber();
  const startBlock = parseStartBlock();

  const marketCreatedTopic = id("MarketCreated(uint256,uint64,address,string,uint64,uint256)");
  const logs = await getLogsChunked(provider, OPENMARKETZ_AMM_ADDRESS, marketCreatedTopic, startBlock, latestBlock);

  const markets: DiscoveredMarket[] = [];

  for (const log of logs) {
    const parsed = abi.parseLog(log);
    if (!parsed) continue;

    const marketId = BigInt(parsed.args[0]).toString();
    const code = BigInt(parsed.args[1]);
    const question = String(parsed.args[3] || "Untitled market").trim();
    const closeTime = Number(parsed.args[4] || 0);

    markets.push({
      marketId,
      openCode: formatOpenCode(code),
      question: question.slice(0, 160),
      closeTime: Number.isFinite(closeTime) ? closeTime : 0,
      blockNumber: log.blockNumber,
    });
  }

  markets.sort((a, b) => Number(BigInt(b.marketId) - BigInt(a.marketId)));

  return {
    generatedAt: new Date().toISOString(),
    latestBlock,
    markets,
  };
}
