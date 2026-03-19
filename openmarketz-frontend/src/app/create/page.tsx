"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import { parseEther } from "ethers";
import { connectMetaMask } from "@/lib/wallet/metamask";
import { getAmmWriteContract } from "@/lib/contracts/openmarketzAmm";

type EthereumAccountsListener = (accounts: string[]) => void;
type EthereumLike = {
  on?: (event: "accountsChanged", listener: EthereumAccountsListener) => void;
  removeListener?: (event: "accountsChanged", listener: EthereumAccountsListener) => void;
};

function buildCloseTimestamp(date: Date | undefined, hour: string, minute: string): number | null {
  if (!date) return null;
  const dt = new Date(date);
  dt.setHours(Number(hour), Number(minute), 0, 0);
  return Math.floor(dt.getTime() / 1000);
}

function formatUtcDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

export default function CreatePage() {
  const [isClient, setIsClient] = useState(false);
  const [address, setAddress] = useState("");
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [closeDate, setCloseDate] = useState<Date | undefined>(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [closeHour, setCloseHour] = useState("12");
  const [closeMinute, setCloseMinute] = useState("00");
  const [seed, setSeed] = useState("2");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as Window & { ethereum?: EthereumLike }).ethereum;
    if (!eth?.on || !eth?.removeListener) return;

    const onAccountsChanged = (accounts: string[]) => {
      const next = accounts?.[0] || "";
      setAddress(next);
    };

    eth.on("accountsChanged", onAccountsChanged);
    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

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

    let seedValue;
    try {
      seedValue = parseEther(seed || "0");
    } catch {
      setStatus("Seed must be a valid MON value.");
      return;
    }

    if (seedValue < parseEther("2")) {
      setStatus("AMM requires at least 2 MON seed.");
      return;
    }

    const closeTimestamp = buildCloseTimestamp(closeDate, closeHour, closeMinute);
    if (!closeTimestamp) {
      setStatus("Choose a close date.");
      return;
    }

    if (closeTimestamp <= Math.floor(Date.now() / 1000)) {
      setStatus("Close time must be in the future.");
      return;
    }

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      const signer = await wallet.provider.getSigner();
      const contract = getAmmWriteContract(signer);

      const tx = await contract.createMarket(question.trim(), description.trim(), closeTimestamp, {
        value: seedValue,
      });
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
      setCloseDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      setCloseHour("12");
      setCloseMinute("00");
      setSeed("2");
    } catch (error) {
      console.error(error);
      setStatus("Create market transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  const closeTimestamp = buildCloseTimestamp(closeDate, closeHour, closeMinute);
  const closeAt = closeTimestamp ? new Date(closeTimestamp * 1000) : null;
  const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const minuteOptions = ["00", "15", "30", "45"];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="shell-card gum-hero p-5 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="gum-kicker">Create</p>
            <h1 className="font-display mt-2 text-3xl font-black sm:text-5xl">Publish a new market</h1>
            <p className="text-muted mt-2 text-sm">Question, close time, and seed liquidity. Keep it sharp.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void connectWallet()} className="cta-button px-4 py-2 text-sm">{address ? "Wallet Connected" : "Connect"}</button>
            <Link href="/" className="ghost-button px-4 py-2 text-sm">Home</Link>
            <Link href="/open" className="ghost-button px-4 py-2 text-sm">Open by Code</Link>
          </div>
        </div>
      </header>

      <section className="shell-card gum-panel p-4 sm:p-6">
        <form className="space-y-4" onSubmit={createMarket}>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Question</label>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} className="field w-full px-3 py-2.5" placeholder="Will ETH close above 5k by Friday?" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="field w-full px-3 py-2.5" rows={3} placeholder="Resolution source and cutoff details" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Close Date</label>
              <div className="field p-2">
                <DayPicker mode="single" selected={closeDate} onSelect={setCloseDate} captionLayout="dropdown" />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Close Time</label>
                <div className="grid grid-cols-2 gap-2">
                  <select value={closeHour} onChange={(e) => setCloseHour(e.target.value)} className="field px-3 py-2.5">
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select value={closeMinute} onChange={(e) => setCloseMinute(e.target.value)} className="field px-3 py-2.5">
                    {minuteOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {closeAt ? (
                <div className="gum-note p-3 text-sm">
                  <p suppressHydrationWarning><strong>Local:</strong> {isClient ? closeAt.toLocaleString() : "-"}</p>
                  <p><strong>UTC:</strong> {formatUtcDate(closeAt)}</p>
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-sm font-medium">Seed MON (min 2)</label>
                <input type="number" step="0.01" min="2" value={seed} onChange={(e) => setSeed(e.target.value)} className="field w-full px-3 py-2.5" />
              </div>
            </div>
          </div>

          <button disabled={loading} className="cta-button px-4 py-2.5 text-sm disabled:opacity-50" type="submit">
            {loading ? "Creating..." : "Create Market"}
          </button>
        </form>
      </section>

      {status ? <p className="text-muted px-1 text-sm">{status}</p> : null}
    </main>
  );
}
