"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import { parseEther } from "ethers";
import { connectMetaMask } from "@/lib/wallet/metamask";
import { getAmmWriteContract } from "@/lib/contracts/openmarketzAmm";
import { loadUserAmmPortfolio, type UserMarketCard } from "@/lib/contracts/userMarkets";

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

function statusLabel(status: number) {
  if (status === 0) return "OPEN";
  if (status === 1) return "RESOLVED";
  return "CANCELED";
}

export default function Home() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [address, setAddress] = useState("");
  const [ammQuestion, setAmmQuestion] = useState("");
  const [ammDescription, setAmmDescription] = useState("");
  const [ammCloseDate, setAmmCloseDate] = useState<Date | undefined>(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [ammCloseHour, setAmmCloseHour] = useState("12");
  const [ammCloseMinute, setAmmCloseMinute] = useState("00");
  const [ammSeed, setAmmSeed] = useState("2");
  const [openCodeInput, setOpenCodeInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [createdMarkets, setCreatedMarkets] = useState<UserMarketCard[]>([]);
  const [investedMarkets, setInvestedMarkets] = useState<UserMarketCard[]>([]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  async function loadUserAmmMarkets(walletAddress: string, forceRefresh = false) {
    const normalized = walletAddress.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
      setCreatedMarkets([]);
      setInvestedMarkets([]);
      return;
    }

    try {
      setLoadingDashboard(true);
      const { created, invested } = await loadUserAmmPortfolio(normalized, { forceRefresh });
      setCreatedMarkets(created);
      setInvestedMarkets(invested);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown dashboard error";
      if (message.includes("NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS")) {
        setStatus("Dashboard unavailable: NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS is missing.");
      } else if (message.includes("invalid") || message.includes("Wallet address")) {
        setStatus("Dashboard unavailable: wallet address is invalid.");
      } else {
        setStatus("Could not load your AMM dashboard. Try refresh.");
      }
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function connectWallet() {
    try {
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      setStatus("Wallet connected.");
      await loadUserAmmMarkets(wallet.address, true);
    } catch (error) {
      console.error(error);
      setStatus("Failed to connect wallet.");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as Window & { ethereum?: EthereumLike }).ethereum;
    if (!eth?.on || !eth?.removeListener) return;

    const onAccountsChanged = (accounts: string[]) => {
      const next = accounts?.[0] || "";
      setAddress(next);
      if (next) {
        void loadUserAmmMarkets(next, true);
      } else {
        setCreatedMarkets([]);
        setInvestedMarkets([]);
      }
    };

    eth.on("accountsChanged", onAccountsChanged);
    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  async function createAmmMarket(e: FormEvent) {
    e.preventDefault();

    if (!ammQuestion.trim()) {
      setStatus("AMM question is required.");
      return;
    }

    let seedValue;
    try {
      seedValue = parseEther(ammSeed || "0");
    } catch {
      setStatus("AMM seed must be a valid MON value.");
      return;
    }

    if (seedValue < parseEther("2")) {
      setStatus("AMM requires at least 2 MON seed.");
      return;
    }

    const closeTimestamp = buildCloseTimestamp(ammCloseDate, ammCloseHour, ammCloseMinute);
    if (!closeTimestamp) {
      setStatus("Please choose a close date from the calendar.");
      return;
    }
    if (closeTimestamp <= Math.floor(Date.now() / 1000)) {
      setStatus("AMM close time must be in the future.");
      return;
    }

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      const signer = await wallet.provider.getSigner();
      const contract = getAmmWriteContract(signer);

      const tx = await contract.createMarket(ammQuestion.trim(), ammDescription.trim(), closeTimestamp, {
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
        setStatus(`AMM market created: ${openCode}`);
        setOpenCodeInput(openCode);
      } else {
        setStatus("AMM market created successfully.");
      }

      setAmmQuestion("");
      setAmmDescription("");
      setAmmCloseDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      setAmmCloseHour("12");
      setAmmCloseMinute("00");
      setAmmSeed("2");

      await loadUserAmmMarkets(wallet.address, true);
    } catch (error) {
      console.error(error);
      setStatus("AMM create market transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  function openAmmByCode(e: FormEvent) {
    e.preventDefault();
    const normalized = openCodeInput.trim().toUpperCase();
    if (!/^OPEN\d{10}$/.test(normalized)) {
      setStatus("Enter a valid OPEN code (OPEN + 10 digits).");
      return;
    }
    router.push(`/amm/${normalized}`);
  }

  const closeTimestamp = buildCloseTimestamp(ammCloseDate, ammCloseHour, ammCloseMinute);
  const closeDate = closeTimestamp ? new Date(closeTimestamp * 1000) : null;
  const closeUtc = closeDate ? formatUtcDate(closeDate) : null;
  const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const minuteOptions = ["00", "15", "30", "45"];

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="shell-card gum-hero overflow-hidden p-5 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="gum-kicker">OpenMarketz</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">Build crisp prediction markets on Monad</h1>
            <p className="text-muted mt-3 max-w-2xl text-sm sm:text-base">Create AMM markets, share OPEN codes, and manage your creator and investor activity from one dashboard.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void connectWallet()} className="cta-button px-5 py-2.5 text-sm">
              {address ? "Wallet Connected" : "Connect MetaMask"}
            </button>
            <div className="gum-tag px-3 py-2 text-sm">
              {address ? `Connected: ${address}` : "Not connected"}
            </div>
          </div>
        </div>
      </header>

      <section className="shell-card gum-panel p-4 sm:p-6">
        <h2 className="text-xl font-bold sm:text-2xl">Create AMM Market</h2>
        <p className="text-muted mt-1 text-sm">Set the question, choose close time, and seed at least 2 MON.</p>

        <form className="mt-5 space-y-4" onSubmit={createAmmMarket}>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Question</label>
            <input
              value={ammQuestion}
              onChange={(e) => setAmmQuestion(e.target.value)}
              className="field w-full px-3 py-2.5"
              placeholder="Will BTC close above 110k this week?"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea
              value={ammDescription}
              onChange={(e) => setAmmDescription(e.target.value)}
              className="field w-full px-3 py-2.5"
              rows={3}
              placeholder="Resolution source and cutoff details"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Close Date</label>
              <div className="field p-2">
                <DayPicker
                  mode="single"
                  selected={ammCloseDate}
                  onSelect={setAmmCloseDate}
                  captionLayout="dropdown"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Close Time</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={ammCloseHour}
                    onChange={(e) => setAmmCloseHour(e.target.value)}
                    className="field px-3 py-2.5"
                  >
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    value={ammCloseMinute}
                    onChange={(e) => setAmmCloseMinute(e.target.value)}
                    className="field px-3 py-2.5"
                  >
                    {minuteOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {closeDate ? (
                <div className="gum-note p-3 text-sm">
                  <p suppressHydrationWarning><strong>Local:</strong> {isClient ? closeDate.toLocaleString() : "-"}</p>
                  <p><strong>UTC:</strong> {closeUtc}</p>
                </div>
              ) : null}

              <label className="mb-1.5 block text-sm font-medium">Seed MON (min 2)</label>
              <input
                type="number"
                step="0.01"
                min="2"
                value={ammSeed}
                onChange={(e) => setAmmSeed(e.target.value)}
                className="field w-full px-3 py-2.5"
              />
            </div>
          </div>

          <button disabled={loading} className="cta-button px-4 py-2.5 text-sm disabled:opacity-50" type="submit">
            {loading ? "Creating AMM..." : "Create AMM"}
          </button>
        </form>
      </section>

      <section className="shell-card gum-panel p-4 sm:p-6">
        <h2 className="text-xl font-bold sm:text-2xl">Open AMM Market By Code</h2>
        <p className="text-muted mt-1 text-sm">Paste your OPEN code to jump directly into trading.</p>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={openAmmByCode}>
          <input
            value={openCodeInput}
            onChange={(e) => setOpenCodeInput(e.target.value)}
            className="field w-full px-3 py-2.5"
            placeholder="OPEN1234567890"
          />
          <button className="cta-button px-4 py-2.5 text-sm" type="submit">
            Open AMM
          </button>
        </form>
      </section>

      <section className="shell-card gum-panel p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">My Markets</h2>
            <p className="text-muted mt-1 text-sm">See your created and invested markets in one place.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void (address ? loadUserAmmMarkets(address, true) : connectWallet())}
              className="ghost-button px-4 py-2.5 text-sm"
            >
              {loadingDashboard ? "Refreshing..." : "Refresh"}
            </button>
            <Link href="/my-markets" className="cta-button px-4 py-2.5 text-sm">
              Open My Markets
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="shell-card gum-panel p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl">Your Created Markets</h2>
            {loadingDashboard ? <span className="text-muted text-xs">Refreshing...</span> : null}
          </div>
          {!address ? <p className="text-muted text-sm">Connect wallet to load your creator dashboard.</p> : null}
          {address && createdMarkets.length === 0 && !loadingDashboard ? <p className="text-muted text-sm">No created markets yet. Create one above and it will appear here instantly.</p> : null}
          {loadingDashboard ? (
            <div className="space-y-2">
              <div className="dashboard-skeleton h-16" />
              <div className="dashboard-skeleton h-16" />
            </div>
          ) : null}
          <div className="space-y-2">
            {createdMarkets.slice(0, 6).map((item) => {
              const itemDate = new Date(Number(item.closeTime) * 1000);
              return (
                <Link href={`/amm/${item.code}`} key={item.id.toString()} className="market-row block">
                  <p className="font-semibold">{item.code}</p>
                  <p className="mt-0.5 text-sm">{item.question}</p>
                  <p className="text-muted mt-1 text-xs"><span className="status-chip">{statusLabel(item.status)}</span> closes {formatUtcDate(itemDate)} UTC</p>
                </Link>
              );
            })}
          </div>
        </article>

        <article className="shell-card gum-panel p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl">Markets You Invested In</h2>
            {loadingDashboard ? <span className="text-muted text-xs">Refreshing...</span> : null}
          </div>
          {!address ? <p className="text-muted text-sm">Connect wallet to load your investor dashboard.</p> : null}
          {address && investedMarkets.length === 0 && !loadingDashboard ? <p className="text-muted text-sm">No investments yet. Open an OPEN code or trade from a shared market.</p> : null}
          {loadingDashboard ? (
            <div className="space-y-2">
              <div className="dashboard-skeleton h-16" />
              <div className="dashboard-skeleton h-16" />
            </div>
          ) : null}
          <div className="space-y-2">
            {investedMarkets.slice(0, 6).map((item) => {
              const itemDate = new Date(Number(item.closeTime) * 1000);
              return (
                <Link href={`/amm/${item.code}`} key={item.id.toString()} className="market-row block">
                  <p className="font-semibold">{item.code}</p>
                  <p className="mt-0.5 text-sm">{item.question}</p>
                  <p className="text-muted mt-1 text-xs"><span className="status-chip">{statusLabel(item.status)}</span> closes {formatUtcDate(itemDate)} UTC</p>
                </Link>
              );
            })}
          </div>
        </article>
      </section>

      {status ? <p className="text-muted px-1 text-sm">{status}</p> : null}
    </main>
  );
}
