import { NextResponse } from "next/server";

import { marketFactoryAbi } from "@/lib/market/abi";
import { getFactoryContract } from "@/lib/market/relayer";

const UNAUTHORIZED_MARKET_AUTHORIZER_SELECTOR = "0x8f1ab9d2";
const INSUFFICIENT_BALANCE_SELECTOR = "0xcf479181";

const readHexData = (value: unknown): string | null => {
  if (typeof value === "string" && value.startsWith("0x") && value.length >= 10) {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return (
    readHexData(candidate.data) ??
    readHexData(candidate.error) ??
    readHexData(candidate.info) ??
    readHexData(candidate.cause) ??
    readHexData(candidate.value)
  );
};

const getCreateMarketErrorMessage = (error: unknown): string => {
  const revertData = readHexData(error);

  if (revertData?.startsWith(UNAUTHORIZED_MARKET_AUTHORIZER_SELECTOR)) {
    return "Market factory is not authorized in vault. From the vault owner wallet, call setMarketAuthorizer(factoryAddress, true), then retry.";
  }

  if (revertData?.startsWith(INSUFFICIENT_BALANCE_SELECTOR)) {
    return "Insufficient in-app vault balance for seed liquidity. Deposit at least 4 MON (2 YES + 2 NO) into the vault from your in-app wallet, then retry.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Could not create market.";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      req: {
        creator: string;
        yesSeed: string;
        noSeed: string;
        question: string;
        oracleDescription: string;
        linksHash: string;
        nonce: string;
        deadline: string;
      };
      links: string[];
      signature: string;
    };

    const factory = getFactoryContract(marketFactoryAbi);
    const tx = await factory.createBinaryMarket(body.req, body.links, body.signature);
    const receipt = await tx.wait();

    const parsedLogs = receipt.logs
      .map((log: { topics: readonly string[]; data: string }) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const created = parsedLogs.find((entry: { name: string }) => entry.name === "MarketCreated");

    return NextResponse.json({
      ok: true,
      txHash: receipt.hash,
      market: created?.args.market,
      code: created?.args.code,
    });
  } catch (error) {
    console.error("Relayer create failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: getCreateMarketErrorMessage(error),
      },
      { status: 400 },
    );
  }
}
