import { Interface, JsonRpcProvider, id } from "ethers";
import { APP_CHAIN_ID, APP_RPC_URL, OPENMARKETZ_AMM_ADDRESS, openMarketzAmmAbi } from "@/lib/contracts/openmarketzAmm";

const DEFAULT_CHUNK_SIZE = 90;
const MIN_CHUNK_SIZE = 10;
const MAX_CHUNK_SIZE = 90;
const DEFAULT_START_BLOCK = 0;
const RPC_TIMEOUT_MS = 8_000;
const MAX_SCAN_RANGE_BLOCKS = 2_000_000;

export type ProtocolStats = {
  totalMarkets: number;
  totalTransactions: number;
  totalVolumeWei: bigint;
  totalLiquidityWei: bigint;
  uniqueUsers: number;
  latestBlock: number;
  generatedAt: Date;
  warnings: string[];
};

function parseStartBlock(): number {
  const raw = process.env.NEXT_PUBLIC_OPENMARKETZ_START_BLOCK;
  if (!raw) return DEFAULT_START_BLOCK;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_START_BLOCK;
  return Math.floor(parsed);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

async function getLogsChunked(
  provider: JsonRpcProvider,
  address: string,
  topic0: string,
  fromBlock: number,
  toBlock: number,
): Promise<Array<{ data: string; topics: readonly string[] }>> {
  if (toBlock < fromBlock) return [];

  const logs: Array<{ data: string; topics: readonly string[] }> = [];
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
    } catch (error) {
      if (chunkSize <= MIN_CHUNK_SIZE) {
        throw error;
      }
      chunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(chunkSize / 2));
    }
  }

  return logs;
}

export async function getProtocolStats(): Promise<ProtocolStats> {
  try {
    if (!OPENMARKETZ_AMM_ADDRESS) {
      throw new Error("NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS is not set");
    }

    const provider = new JsonRpcProvider(APP_RPC_URL);
    const abi = new Interface(openMarketzAmmAbi);

    const network = await withTimeout(provider.getNetwork(), RPC_TIMEOUT_MS, "RPC timeout while reading chain id");
    if (network.chainId !== APP_CHAIN_ID) {
      throw new Error(`Wrong chain from RPC (expected ${APP_CHAIN_ID.toString()}, got ${network.chainId.toString()})`);
    }

    const latestBlock = await withTimeout(provider.getBlockNumber(), RPC_TIMEOUT_MS, "RPC timeout while reading latest block");
    const startBlock = parseStartBlock();
    if (startBlock > latestBlock) {
      throw new Error(`NEXT_PUBLIC_OPENMARKETZ_START_BLOCK (${startBlock}) is above latest block (${latestBlock})`);
    }

    const blockRange = latestBlock - startBlock;
    if (blockRange > MAX_SCAN_RANGE_BLOCKS) {
      throw new Error(
        `Scan range too large (${blockRange} blocks). Set NEXT_PUBLIC_OPENMARKETZ_START_BLOCK closer to deploy block.`,
      );
    }

    const eventTopics = {
      marketCreated: id("MarketCreated(uint256,uint64,address,string,uint64,uint256)"),
      liquidityAdded: id("LiquidityAdded(uint256,address,uint256,uint256)"),
      sharesBought: id("SharesBought(uint256,address,bool,uint256,uint256,uint256)"),
      sharesSold: id("SharesSold(uint256,address,bool,uint256,uint256,uint256)"),
      marketResolved: id("MarketResolved(uint256,bool,address,uint256)"),
      winnerRedeemed: id("WinnerRedeemed(uint256,address,uint256,uint256,uint256)"),
    };

    const warnings: string[] = [];

    const safeLogs = async (name: string, topic0: string) => {
      try {
        return await getLogsChunked(provider, OPENMARKETZ_AMM_ADDRESS, topic0, startBlock, latestBlock);
      } catch (error) {
        console.error(`Stats scan failed for ${name}`, error);
        warnings.push(`${name} scan failed`);
        return [];
      }
    };

    const [marketCreatedLogs, liquidityAddedLogs, sharesBoughtLogs, sharesSoldLogs, marketResolvedLogs, winnerRedeemedLogs] =
      await Promise.all([
        safeLogs("MarketCreated", eventTopics.marketCreated),
        safeLogs("LiquidityAdded", eventTopics.liquidityAdded),
        safeLogs("SharesBought", eventTopics.sharesBought),
        safeLogs("SharesSold", eventTopics.sharesSold),
        safeLogs("MarketResolved", eventTopics.marketResolved),
        safeLogs("WinnerRedeemed", eventTopics.winnerRedeemed),
      ]);

    let totalVolumeWei = BigInt(0);
    let totalLiquidityWei = BigInt(0);
    const uniqueUsers = new Set<string>();

    for (const log of marketCreatedLogs) {
      const parsed = abi.parseLog(log);
      if (!parsed) continue;

      const creator = String(parsed.args[2] || "").toLowerCase();
      const seedCollateral = BigInt(parsed.args[5] || 0);

      if (creator) uniqueUsers.add(creator);
      totalVolumeWei += seedCollateral;
      totalLiquidityWei += seedCollateral;
    }

    for (const log of liquidityAddedLogs) {
      const parsed = abi.parseLog(log);
      if (!parsed) continue;

      const providerAddress = String(parsed.args[1] || "").toLowerCase();
      const amount = BigInt(parsed.args[2] || 0);

      if (providerAddress) uniqueUsers.add(providerAddress);
      totalVolumeWei += amount;
      totalLiquidityWei += amount;
    }

    for (const log of sharesBoughtLogs) {
      const parsed = abi.parseLog(log);
      if (!parsed) continue;

      const trader = String(parsed.args[1] || "").toLowerCase();
      const grossCost = BigInt(parsed.args[4] || 0);

      if (trader) uniqueUsers.add(trader);
      totalVolumeWei += grossCost;
    }

    for (const log of sharesSoldLogs) {
      const parsed = abi.parseLog(log);
      if (!parsed) continue;

      const trader = String(parsed.args[1] || "").toLowerCase();
      const grossProceeds = BigInt(parsed.args[4] || 0);

      if (trader) uniqueUsers.add(trader);
      totalVolumeWei += grossProceeds;
    }

    for (const log of marketResolvedLogs) {
      const parsed = abi.parseLog(log);
      if (!parsed) continue;

      const resolver = String(parsed.args[2] || "").toLowerCase();
      if (resolver) uniqueUsers.add(resolver);
    }

    for (const log of winnerRedeemedLogs) {
      const parsed = abi.parseLog(log);
      if (!parsed) continue;

      const trader = String(parsed.args[1] || "").toLowerCase();
      const grossPayout = BigInt(parsed.args[2] || 0);

      if (trader) uniqueUsers.add(trader);
      totalVolumeWei += grossPayout;
    }

    const totalTransactions =
      marketCreatedLogs.length +
      liquidityAddedLogs.length +
      sharesBoughtLogs.length +
      sharesSoldLogs.length +
      marketResolvedLogs.length +
      winnerRedeemedLogs.length;

    return {
      totalMarkets: marketCreatedLogs.length,
      totalTransactions,
      totalVolumeWei,
      totalLiquidityWei,
      uniqueUsers: uniqueUsers.size,
      latestBlock,
      generatedAt: new Date(),
      warnings,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Protocol stats error: ${detail}`);
  }
}
