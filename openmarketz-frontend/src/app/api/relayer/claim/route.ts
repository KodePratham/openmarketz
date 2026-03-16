import { NextResponse } from "next/server";

import { binaryMarketAbi } from "@/lib/market/abi";
import { getMarketContract } from "@/lib/market/relayer";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      marketAddress: string;
      req: {
        claimant: string;
        nonce: string;
        deadline: string;
      };
      signature: string;
    };

    const market = getMarketContract(body.marketAddress, binaryMarketAbi);
    const tx = await market.claim(body.req, body.signature);
    const receipt = await tx.wait();

    return NextResponse.json({ ok: true, txHash: receipt.hash });
  } catch (error) {
    console.error("Relayer claim failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error)?.message ?? "Could not claim market payout." },
      { status: 400 },
    );
  }
}
