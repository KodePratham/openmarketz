"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEther } from "ethers";
import { connectMetaMask } from "@/lib/wallet/metamask";
import { getReadContract, getWriteContract } from "@/lib/contracts/openmarketz";

type MarketView = {
  id: bigint;
  creator: string;
  question: string;
  description: string;
  closeTime: bigint;
  code: bigint;
  totalYesPool: bigint;
  totalNoPool: bigint;
  outcomeYes: boolean;
  status: number;
};

export default function MarketByCodePage() {
  const params = useParams<{ code: string }>();
  const code = useMemo(() => String(params.code || "").toUpperCase(), [params.code]);

  const [address, setAddress] = useState("");
  const [market, setMarket] = useState<MarketView | null>(null);
  const [marketNotFound, setMarketNotFound] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [betAmount, setBetAmount] = useState("0.05");
  const [loading, setLoading] = useState(false);

  const loadMarket = useCallback(async () => {
    try {
      setLoading(true);
      setMarketNotFound(false);
      const readContract = getReadContract();
      const marketId = await readContract.getMarketIdByOpenCode(code);

      if (marketId === BigInt(0)) {
        setMarket(null);
        setMarketNotFound(true);
        return;
      }

      const m = await readContract.getMarket(marketId);
      setMarket({
        id: marketId,
        creator: m.creator,
        question: m.question,
        description: m.description,
        closeTime: m.closeTime,
        code: m.code,
        totalYesPool: m.totalYesPool,
        totalNoPool: m.totalNoPool,
        outcomeYes: m.outcomeYes,
        status: Number(m.status),
      });
    } catch (error) {
      console.error(error);
      setStatusText("Failed to load market.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (code) {
      void loadMarket();
    }
  }, [code, loadMarket]);

  async function connect() {
    try {
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      setStatusText("Wallet connected.");
    } catch (error) {
      console.error(error);
      setStatusText("Wallet connect failed.");
    }
  }

  async function placeBet(yesSide: boolean, e: FormEvent) {
    e.preventDefault();
    if (!market) return;

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      const signer = await wallet.provider.getSigner();
      const contract = getWriteContract(signer);

      const tx = await contract.placeBet(market.id, yesSide, {
        value: parseEther(betAmount),
      });
      await tx.wait();

      setStatusText("Bet placed successfully.");
      await loadMarket();
    } catch (error) {
      console.error(error);
      setStatusText("Bet transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  async function resolve(outcomeYes: boolean) {
    if (!market) return;

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      const signer = await wallet.provider.getSigner();
      const contract = getWriteContract(signer);

      const tx = await contract.resolveMarket(market.id, outcomeYes);
      await tx.wait();

      setStatusText("Market resolved.");
      await loadMarket();
    } catch (error) {
      console.error(error);
      setStatusText("Resolve transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  async function claim() {
    if (!market) return;

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      const signer = await wallet.provider.getSigner();
      const contract = getWriteContract(signer);

      const tx = await contract.claimPayout(market.id);
      await tx.wait();

      setStatusText("Payout claimed.");
      await loadMarket();
    } catch (error) {
      console.error(error);
      setStatusText("Claim failed.");
    } finally {
      setLoading(false);
    }
  }

  const isCreator = market && address && market.creator.toLowerCase() === address.toLowerCase();

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Market {code}</h1>
        <div className="flex gap-3">
          <Link href="/" className="rounded border px-3 py-2 text-sm">Home</Link>
          <Link href="/my-markets" className="rounded border px-3 py-2 text-sm">My Markets</Link>
          <button onClick={connect} className="rounded bg-black px-3 py-2 text-sm text-white">{address ? "Connected" : "Connect"}</button>
        </div>
      </div>

      {loading ? <p>Loading...</p> : null}
      {marketNotFound ? <p>No market found for this OPEN code.</p> : null}

      {market ? (
        <section className="space-y-4 rounded border p-4">
          <p><strong>Question:</strong> {market.question}</p>
          <p><strong>Description:</strong> {market.description}</p>
          <p><strong>Creator:</strong> {market.creator}</p>
          <p><strong>Closes:</strong> {new Date(Number(market.closeTime) * 1000).toLocaleString()}</p>
          <p><strong>YES Pool:</strong> {formatEther(market.totalYesPool)} MON</p>
          <p><strong>NO Pool:</strong> {formatEther(market.totalNoPool)} MON</p>
          <p><strong>Status:</strong> {market.status === 0 ? "OPEN" : market.status === 1 ? "RESOLVED" : "CANCELED"}</p>

          <form className="space-y-3" onSubmit={(e) => placeBet(true, e)}>
            <label className="block text-sm">Bet amount (MON)</label>
            <input
              type="number"
              step="0.01"
              min="0.001"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
            <div className="flex gap-3">
              <button disabled={loading || market.status !== 0} onClick={(e) => void placeBet(true, e)} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">Bet YES</button>
              <button disabled={loading || market.status !== 0} onClick={(e) => void placeBet(false, e)} className="rounded bg-rose-600 px-4 py-2 text-white disabled:opacity-50">Bet NO</button>
            </div>
          </form>

          {isCreator ? (
            <div className="flex gap-3">
              <button disabled={loading || market.status !== 0} onClick={() => void resolve(true)} className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50">Resolve YES</button>
              <button disabled={loading || market.status !== 0} onClick={() => void resolve(false)} className="rounded bg-rose-700 px-4 py-2 text-white disabled:opacity-50">Resolve NO</button>
            </div>
          ) : null}

          <button disabled={loading || market.status !== 1} onClick={() => void claim()} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">Claim Payout</button>
        </section>
      ) : null}

      {statusText ? <p className="text-sm text-gray-700">{statusText}</p> : null}
    </main>
  );
}
