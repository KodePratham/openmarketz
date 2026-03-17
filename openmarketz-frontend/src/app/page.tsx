"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { connectMetaMask } from "@/lib/wallet/metamask";
import { getWriteContract } from "@/lib/contracts/openmarketz";

function toUnixTimestamp(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export default function Home() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [openCodeInput, setOpenCodeInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function connectWallet() {
    try {
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      setStatus("Wallet connected.");
    } catch (error) {
      console.error(error);
      setStatus("Failed to connect wallet.");
    }
  }

  async function createMarket(e: FormEvent) {
    e.preventDefault();

    if (!question.trim()) {
      setStatus("Question is required.");
      return;
    }

    if (!closeTime) {
      setStatus("Close time is required.");
      return;
    }

    const closeTimestamp = toUnixTimestamp(closeTime);
    if (closeTimestamp <= Math.floor(Date.now() / 1000)) {
      setStatus("Close time must be in the future.");
      return;
    }

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      const signer = await wallet.provider.getSigner();
      const contract = getWriteContract(signer);

      const tx = await contract.createMarket(question.trim(), description.trim(), closeTimestamp);
      const receipt = await tx.wait();

      const createdEvent = receipt.logs
        .map((log: { topics: string[]; data: string }) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: { name?: string } | null) => parsed?.name === "MarketCreated");

      if (createdEvent?.args?.code !== undefined) {
        const openCode = await contract.formatOpenCode(createdEvent.args.code);
        setStatus(`Market created: ${openCode}`);
      } else {
        setStatus("Market created successfully.");
      }

      setQuestion("");
      setDescription("");
      setCloseTime("");
    } catch (error) {
      console.error(error);
      setStatus("Create market transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  function openByCode(e: FormEvent) {
    e.preventDefault();
    const normalized = openCodeInput.trim().toUpperCase();
    if (!normalized.startsWith("OPEN") || normalized.length !== 14) {
      setStatus("Enter a valid OPEN code (OPEN + 10 digits).");
      return;
    }
    router.push(`/market/${normalized}`);
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-8 px-6 py-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">OpenMarketz</h1>
        <p className="text-gray-700">Permissionless prediction markets on Monad testnet.</p>
        <div className="flex gap-3">
          <button onClick={() => void connectWallet()} className="rounded bg-black px-4 py-2 text-white">
            {address ? "Wallet Connected" : "Connect MetaMask"}
          </button>
          <Link href="/my-markets" className="rounded border px-4 py-2">
            My Markets
          </Link>
        </div>
        <p className="text-sm text-gray-700">{address ? `Connected: ${address}` : "Not connected"}</p>
      </header>

      <section className="rounded border p-4">
        <h2 className="mb-4 text-xl font-semibold">Create Market</h2>
        <form className="space-y-4" onSubmit={createMarket}>
          <div>
            <label className="mb-1 block text-sm">Question</label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full rounded border px-3 py-2"
              placeholder="Will ETH hit 5k before Q3?"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border px-3 py-2"
              rows={3}
              placeholder="Resolution criteria and context"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm">Close Time</label>
            <input
              type="datetime-local"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </div>

          <button disabled={loading} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" type="submit">
            {loading ? "Creating..." : "Create Market"}
          </button>
        </form>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-4 text-xl font-semibold">Open Market By Code</h2>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={openByCode}>
          <input
            value={openCodeInput}
            onChange={(e) => setOpenCodeInput(e.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="OPEN1234567890"
          />
          <button className="rounded bg-emerald-700 px-4 py-2 text-white" type="submit">
            Open
          </button>
        </form>
      </section>

      {status ? <p className="text-sm text-gray-700">{status}</p> : null}
    </main>
  );
}
