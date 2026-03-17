"use client";

import Link from "next/link";
import { useState } from "react";
import { connectMetaMask } from "@/lib/wallet/metamask";
import { getReadContract } from "@/lib/contracts/openmarketz";

type MarketCard = {
  id: bigint;
  code: string;
  question: string;
  status: number;
};

export default function MyMarketsPage() {
  const [address, setAddress] = useState("");
  const [created, setCreated] = useState<MarketCard[]>([]);
  const [participated, setParticipated] = useState<MarketCard[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function connectAndLoad() {
    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);

      const contract = getReadContract();
      const createdIds = await contract.getCreatedMarkets(wallet.address);
      const participatedIds = await contract.getParticipatedMarkets(wallet.address);

      const createdMarkets: MarketCard[] = [];
      for (const id of createdIds as bigint[]) {
        const m = await contract.getMarket(id);
        const openCode = await contract.formatOpenCode(m.code);
        createdMarkets.push({ id, code: openCode, question: m.question, status: Number(m.status) });
      }

      const participatedMarkets: MarketCard[] = [];
      for (const id of participatedIds as bigint[]) {
        const m = await contract.getMarket(id);
        const openCode = await contract.formatOpenCode(m.code);
        participatedMarkets.push({ id, code: openCode, question: m.question, status: Number(m.status) });
      }

      setCreated(createdMarkets);
      setParticipated(participatedMarkets);
      setMessage("Loaded markets.");
    } catch (error) {
      console.error(error);
      setMessage("Failed to load markets.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Markets</h1>
        <div className="flex gap-3">
          <Link href="/" className="rounded border px-3 py-2 text-sm">Home</Link>
          <button onClick={() => void connectAndLoad()} className="rounded bg-black px-3 py-2 text-sm text-white">
            {loading ? "Loading..." : "Connect + Load"}
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-700">Connected: {address || "not connected"}</p>
      {message ? <p className="text-sm text-gray-700">{message}</p> : null}

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Created Markets</h2>
        {created.length === 0 ? <p className="text-sm">No created markets yet.</p> : null}
        {created.map((market) => (
          <div key={`created-${market.id.toString()}`} className="rounded border p-3">
            <p className="font-medium">{market.code}</p>
            <p>{market.question}</p>
            <p className="text-sm text-gray-600">Status: {market.status === 0 ? "OPEN" : market.status === 1 ? "RESOLVED" : "CANCELED"}</p>
            <Link className="text-sm underline" href={`/market/${market.code}`}>Open</Link>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Participated Markets</h2>
        {participated.length === 0 ? <p className="text-sm">No participated markets yet.</p> : null}
        {participated.map((market) => (
          <div key={`part-${market.id.toString()}`} className="rounded border p-3">
            <p className="font-medium">{market.code}</p>
            <p>{market.question}</p>
            <p className="text-sm text-gray-600">Status: {market.status === 0 ? "OPEN" : market.status === 1 ? "RESOLVED" : "CANCELED"}</p>
            <Link className="text-sm underline" href={`/market/${market.code}`}>Open</Link>
          </div>
        ))}
      </section>
    </main>
  );
}
