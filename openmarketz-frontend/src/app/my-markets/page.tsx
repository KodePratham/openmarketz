"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { connectMetaMask } from "@/lib/wallet/metamask";
import { loadUserAmmPortfolio, type UserMarketCard } from "@/lib/contracts/userMarkets";

type SortKey = "newest" | "closingSoon" | "code";
type StatusFilter = "all" | "open" | "resolved" | "canceled";
type EthereumAccountsListener = (accounts: string[]) => void;
type EthereumLike = {
  on?: (event: "accountsChanged", listener: EthereumAccountsListener) => void;
  removeListener?: (event: "accountsChanged", listener: EthereumAccountsListener) => void;
};

function statusLabel(status: number) {
  if (status === 0) return "OPEN";
  if (status === 1) return "RESOLVED";
  return "CANCELED";
}

function formatUtcDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

function matchesStatus(item: UserMarketCard, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return item.status === 0;
  if (filter === "resolved") return item.status === 1;
  return item.status === 2;
}

function applySort(input: UserMarketCard[], sortKey: SortKey): UserMarketCard[] {
  const output = [...input];

  if (sortKey === "closingSoon") {
    return output.sort((a, b) => Number(a.closeTime - b.closeTime));
  }

  if (sortKey === "code") {
    return output.sort((a, b) => a.code.localeCompare(b.code));
  }

  return output.sort((a, b) => Number(b.id - a.id));
}

export default function MyMarketsPage() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Connect wallet to load your portfolio.");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createdMarkets, setCreatedMarkets] = useState<UserMarketCard[]>([]);
  const [investedMarkets, setInvestedMarkets] = useState<UserMarketCard[]>([]);

  async function refreshPortfolio(walletAddress: string, forceRefresh = false) {
    const normalized = walletAddress.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
      setCreatedMarkets([]);
      setInvestedMarkets([]);
      setStatus("Wallet address is invalid.");
      return;
    }

    try {
      setLoading(true);
      const portfolio = await loadUserAmmPortfolio(normalized, { forceRefresh });
      setCreatedMarkets(portfolio.created);
      setInvestedMarkets(portfolio.invested);
      setStatus(portfolio.fromCache ? "Showing cached portfolio snapshot." : "Portfolio refreshed.");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown portfolio error";
      if (message.includes("NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS")) {
        setStatus("Cannot load markets: contract address env is missing.");
      } else {
        setStatus("Could not load portfolio right now.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function connectWallet() {
    try {
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      await refreshPortfolio(wallet.address, true);
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
        void refreshPortfolio(next, true);
      } else {
        setCreatedMarkets([]);
        setInvestedMarkets([]);
        setStatus("Wallet disconnected.");
      }
    };

    eth.on("accountsChanged", onAccountsChanged);
    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const query = search.trim().toLowerCase();

  const filteredCreated = useMemo(() => {
    return applySort(
      createdMarkets.filter((item) => {
        const matchesQuery = !query || item.code.toLowerCase().includes(query) || item.question.toLowerCase().includes(query);
        return matchesQuery && matchesStatus(item, statusFilter);
      }),
      sortKey,
    );
  }, [createdMarkets, query, statusFilter, sortKey]);

  const filteredInvested = useMemo(() => {
    return applySort(
      investedMarkets.filter((item) => {
        const matchesQuery = !query || item.code.toLowerCase().includes(query) || item.question.toLowerCase().includes(query);
        return matchesQuery && matchesStatus(item, statusFilter);
      }),
      sortKey,
    );
  }, [investedMarkets, query, statusFilter, sortKey]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="shell-card gum-hero overflow-hidden p-5 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="gum-kicker">Portfolio</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">My AMM Markets</h1>
            <p className="text-muted mt-3 max-w-2xl text-sm sm:text-base">Track everything you created and invested in, with instant filtering and sorting.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void connectWallet()} className="cta-button px-4 py-2.5 text-sm">
              {address ? "Wallet Connected" : "Connect MetaMask"}
            </button>
            <button
              type="button"
              onClick={() => void (address ? refreshPortfolio(address, true) : connectWallet())}
              className="ghost-button px-4 py-2.5 text-sm"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link href="/" className="ghost-button px-4 py-2.5 text-sm">
              Back Home
            </Link>
          </div>
        </div>
      </header>

      <section className="shell-card gum-panel p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="field w-full px-3 py-2.5"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by OPEN code or question"
          />
          <select className="field px-3 py-2.5" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="canceled">Canceled</option>
          </select>
          <select className="field px-3 py-2.5" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="newest">Sort: Newest</option>
            <option value="closingSoon">Sort: Closing Soon</option>
            <option value="code">Sort: Code</option>
          </select>
        </div>
        <p className="text-muted mt-3 text-sm">{status}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="shell-card gum-panel p-4 sm:p-6">
          <h2 className="text-lg font-bold sm:text-xl">Created ({filteredCreated.length})</h2>
          {loading ? (
            <div className="mt-3 space-y-2">
              <div className="dashboard-skeleton h-16" />
              <div className="dashboard-skeleton h-16" />
              <div className="dashboard-skeleton h-16" />
            </div>
          ) : null}
          {!loading && filteredCreated.length === 0 ? <p className="text-muted mt-3 text-sm">No created markets match your filters yet.</p> : null}
          <div className="mt-3 space-y-2">
            {filteredCreated.map((item) => {
              const itemDate = new Date(Number(item.closeTime) * 1000);
              return (
                <Link href={`/amm/${item.code}`} key={item.id.toString()} className="market-row block">
                  <p className="font-semibold">{item.code}</p>
                  <p className="mt-0.5 text-sm">{item.question}</p>
                  <p className="text-muted mt-1 text-xs">
                    <span className="status-chip">{statusLabel(item.status)}</span> closes {formatUtcDate(itemDate)} UTC
                  </p>
                </Link>
              );
            })}
          </div>
        </article>

        <article className="shell-card gum-panel p-4 sm:p-6">
          <h2 className="text-lg font-bold sm:text-xl">Invested ({filteredInvested.length})</h2>
          {loading ? (
            <div className="mt-3 space-y-2">
              <div className="dashboard-skeleton h-16" />
              <div className="dashboard-skeleton h-16" />
              <div className="dashboard-skeleton h-16" />
            </div>
          ) : null}
          {!loading && filteredInvested.length === 0 ? <p className="text-muted mt-3 text-sm">No invested markets match your filters yet.</p> : null}
          <div className="mt-3 space-y-2">
            {filteredInvested.map((item) => {
              const itemDate = new Date(Number(item.closeTime) * 1000);
              return (
                <Link href={`/amm/${item.code}`} key={item.id.toString()} className="market-row block">
                  <p className="font-semibold">{item.code}</p>
                  <p className="mt-0.5 text-sm">{item.question}</p>
                  <p className="text-muted mt-1 text-xs">
                    <span className="status-chip">{statusLabel(item.status)}</span> closes {formatUtcDate(itemDate)} UTC
                  </p>
                </Link>
              );
            })}
          </div>
        </article>
      </section>
    </main>
  );
}
