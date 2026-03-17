"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEther } from "ethers";
import { connectMetaMask } from "@/lib/wallet/metamask";
import { getAmmReadContract, getAmmWriteContract } from "@/lib/contracts/openmarketzAmm";

type MarketView = {
  id: bigint;
  code: bigint;
  creator: string;
  question: string;
  description: string;
  closeTime: bigint;
  resolveDeadline: bigint;
  outcomeYes: boolean;
  status: number;
  yesSharesSupply: bigint;
  noSharesSupply: bigint;
  collateralPool: bigint;
  winnerPayoutPerShare: bigint;
};

type PositionView = {
  yesShares: bigint;
  noShares: bigint;
  netCashDeposited: bigint;
};

const BIG_ZERO = BigInt(0);
const BPS_DENOM = BigInt(10_000);
const TRADE_FEE_BPS = BigInt(50);
const POLL_MS = 2500;

function formatCountdown(targetUnix: number, nowUnix: number): string {
  const delta = targetUnix - nowUnix;
  if (delta <= 0) return "0m 0s";

  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const minutes = Math.floor((delta % 3600) / 60);
  const seconds = delta % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export default function AmmMarketPage() {
  const params = useParams<{ marketId: string }>();
  const marketKey = useMemo(() => String(params.marketId || "").trim(), [params.marketId]);

  const [address, setAddress] = useState("");
  const [resolvedMarketId, setResolvedMarketId] = useState<bigint | null>(null);
  const [openCode, setOpenCode] = useState("");
  const [market, setMarket] = useState<MarketView | null>(null);
  const [position, setPosition] = useState<PositionView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [sharesInput, setSharesInput] = useState("1");
  const [priceYesBps, setPriceYesBps] = useState<bigint>(BIG_ZERO);
  const [priceNoBps, setPriceNoBps] = useState<bigint>(BIG_ZERO);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [nowUnix, setNowUnix] = useState(Math.floor(Date.now() / 1000));
  const [resolveChoice, setResolveChoice] = useState<boolean | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const loadMarket = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setIsRefreshing(true);
        } else {
          setLoading(true);
        }

        const read = getAmmReadContract();
        const normalized = marketKey.toUpperCase();
        let marketId: bigint | null = null;

        if (/^OPEN\d{10}$/.test(normalized)) {
          const lookupId = await read.getMarketIdByOpenCode(normalized);
          if (lookupId === BIG_ZERO) {
            setNotFound(true);
            setMarket(null);
            setResolvedMarketId(null);
            setOpenCode("");
            return;
          }
          marketId = BigInt(lookupId);
        } else if (/^\d+$/.test(marketKey)) {
          marketId = BigInt(marketKey);
        } else {
          setNotFound(true);
          setMarket(null);
          setResolvedMarketId(null);
          setOpenCode("");
          return;
        }

        const m = await read.getMarket(marketId);
        const formattedCode = await read.formatOpenCode(m.code);

        setMarket({
          id: marketId,
          code: m.code,
          creator: m.creator,
          question: m.question,
          description: m.description,
          closeTime: m.closeTime,
          resolveDeadline: m.resolveDeadline,
          outcomeYes: m.outcomeYes,
          status: Number(m.status),
          yesSharesSupply: m.yesSharesSupply,
          noSharesSupply: m.noSharesSupply,
          collateralPool: m.collateralPool,
          winnerPayoutPerShare: m.winnerPayoutPerShare,
        });

        setResolvedMarketId(marketId);
        setOpenCode(formattedCode);

        const [yesPrice, noPrice] = await Promise.all([
          read.getImpliedPriceBps(marketId, true),
          read.getImpliedPriceBps(marketId, false),
        ]);

        setPriceYesBps(BigInt(yesPrice));
        setPriceNoBps(BigInt(noPrice));
        setNotFound(false);
        setLastUpdatedAt(new Date());

        if (address && marketId !== null) {
          const p = await read.traderPositions(marketId, address);
          setPosition({
            yesShares: p.yesShares,
            noShares: p.noShares,
            netCashDeposited: p.netCashDeposited,
          });
        } else {
          setPosition(null);
        }
      } catch (error) {
        console.error(error);
        setNotFound(true);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [address, marketKey],
  );

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadMarket(true);
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [loadMarket]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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

  function parseSharesToWei(): bigint | null {
    try {
      const value = parseEther(sharesInput || "0");
      if (value <= BIG_ZERO) return null;
      return value;
    } catch {
      return null;
    }
  }

  function quoteBuyTotal(sharesWei: bigint, yesSide: boolean): bigint {
    const priceBps = yesSide ? priceYesBps : priceNoBps;
    const gross = (sharesWei * priceBps) / BPS_DENOM;
    const fee = (gross * TRADE_FEE_BPS) / BPS_DENOM;
    return gross + fee;
  }

  async function buy(yesSide: boolean, e: FormEvent) {
    e.preventDefault();
    if (!resolvedMarketId) return;

    const sharesWei = parseSharesToWei();
    if (!sharesWei) {
      setStatusText("Enter a valid shares amount.");
      return;
    }

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      const signer = await wallet.provider.getSigner();
      const contract = getAmmWriteContract(signer);

      const totalCost = quoteBuyTotal(sharesWei, yesSide);
      const tx = yesSide
        ? await contract.buyYes(resolvedMarketId, sharesWei, { value: totalCost })
        : await contract.buyNo(resolvedMarketId, sharesWei, { value: totalCost });
      await tx.wait();

      setStatusText(`Buy ${yesSide ? "YES" : "NO"} confirmed.`);
      await loadMarket();
    } catch (error) {
      console.error(error);
      setStatusText(`Buy ${yesSide ? "YES" : "NO"} failed.`);
    } finally {
      setLoading(false);
    }
  }

  async function sell(yesSide: boolean) {
    if (!resolvedMarketId) return;

    const sharesWei = parseSharesToWei();
    if (!sharesWei) {
      setStatusText("Enter a valid shares amount.");
      return;
    }

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      const signer = await wallet.provider.getSigner();
      const contract = getAmmWriteContract(signer);

      const tx = yesSide
        ? await contract.sellYes(resolvedMarketId, sharesWei)
        : await contract.sellNo(resolvedMarketId, sharesWei);
      await tx.wait();

      setStatusText(`Sell ${yesSide ? "YES" : "NO"} confirmed.`);
      await loadMarket();
    } catch (error) {
      console.error(error);
      setStatusText(`Sell ${yesSide ? "YES" : "NO"} failed.`);
    } finally {
      setLoading(false);
    }
  }

  async function resolve(outcomeYes: boolean) {
    if (!resolvedMarketId) return;

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      const signer = await wallet.provider.getSigner();
      const contract = getAmmWriteContract(signer);

      const tx = await contract.resolveMarket(resolvedMarketId, outcomeYes);
      await tx.wait();

      setStatusText(`Market resolved ${outcomeYes ? "YES" : "NO"}.`);
      await loadMarket();
    } catch (error) {
      console.error(error);
      setStatusText("Resolve failed.");
    } finally {
      setLoading(false);
    }
  }

  async function redeem() {
    if (!resolvedMarketId) return;

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      const signer = await wallet.provider.getSigner();
      const contract = getAmmWriteContract(signer);

      const tx = await contract.redeemWinningShares(resolvedMarketId);
      await tx.wait();

      setStatusText("Winning shares redeemed.");
      await loadMarket();
    } catch (error) {
      console.error(error);
      setStatusText("Redeem failed.");
    } finally {
      setLoading(false);
    }
  }

  const yesPricePct = Number(priceYesBps) / 100;
  const noPricePct = Number(priceNoBps) / 100;
  const yesBarPct = Math.max(0, Math.min(100, yesPricePct));
  const noBarPct = Math.max(0, Math.min(100, noPricePct));
  const isCreator = Boolean(market && address && market.creator.toLowerCase() === address.toLowerCase());
  const canResolveNow = Boolean(market && nowUnix > Number(market.closeTime));
  const closeDate = market ? new Date(Number(market.closeTime) * 1000) : null;
  const deadlineDate = market ? new Date(Number(market.resolveDeadline) * 1000) : null;
  const closeCountdown = market ? formatCountdown(Number(market.closeTime), nowUnix) : "-";
  const deadlineCountdown = market ? formatCountdown(Number(market.resolveDeadline), nowUnix) : "-";

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="shell-card bg-[linear-gradient(135deg,#fff_0%,#f2e9ff_80%)] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-purple-950 sm:text-3xl">AMM Market {openCode || marketKey.toUpperCase()}</h1>
          <div className="flex gap-3">
            <Link href="/" className="rounded-xl border border-purple-300 bg-white px-3 py-2 text-sm font-medium text-purple-900">Home</Link>
            <button onClick={connect} className="cta-button px-3 py-2 text-sm">
              {address ? "Connected" : "Connect"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-purple-200 bg-white/80 p-3 text-sm text-purple-900">
          <p>Realtime mode: polling every 2.5s.</p>
          <p>{isRefreshing ? "Refreshing..." : "Stable"}</p>
          <p suppressHydrationWarning>Last updated: {isClient && lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : "-"}</p>
        </div>
      </div>

      {loading ? <p className="text-muted text-sm">Loading...</p> : null}
      {notFound ? <p className="text-sm font-medium text-purple-900">Market not found for this code.</p> : null}

      {market ? (
        <section className="shell-card space-y-4 p-4 sm:p-6">
          <p><strong>Code:</strong> {openCode}</p>
          <p><strong>Market ID:</strong> {market.id.toString()}</p>
          <p><strong>Question:</strong> {market.question}</p>
          <p><strong>Description:</strong> {market.description}</p>
          <p><strong>Creator:</strong> {market.creator}</p>

          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 text-sm text-purple-900">
            <p suppressHydrationWarning><strong>Close (local):</strong> {isClient ? closeDate?.toLocaleString() : "-"}</p>
            <p><strong>Close (UTC):</strong> {closeDate?.toUTCString()}</p>
            <p><strong>Time to close:</strong> {closeCountdown}</p>
            <p suppressHydrationWarning><strong>Resolve deadline (local):</strong> {isClient ? deadlineDate?.toLocaleString() : "-"}</p>
            <p><strong>Resolve deadline (UTC):</strong> {deadlineDate?.toUTCString()}</p>
            <p><strong>Time to auto-cancel window:</strong> {deadlineCountdown}</p>
          </div>

          <div className="rounded-xl border border-purple-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-purple-900">
              <span>YES Odds: {yesPricePct.toFixed(2)}%</span>
              <span>NO Odds: {noPricePct.toFixed(2)}%</span>
            </div>
            <div className="h-5 overflow-hidden rounded-full border border-purple-200 bg-purple-100">
              <div className="flex h-full">
                <div className="h-full bg-purple-700" style={{ width: `${yesBarPct}%` }} />
                <div className="h-full bg-purple-300" style={{ width: `${noBarPct}%` }} />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-purple-800">
              <span>YES side confidence</span>
              <span>NO side confidence</span>
            </div>
          </div>

          <p><strong>Status:</strong> {market.status === 0 ? "OPEN" : market.status === 1 ? "RESOLVED" : "CANCELED"}</p>
          <p><strong>YES supply:</strong> {formatEther(market.yesSharesSupply)} shares</p>
          <p><strong>NO supply:</strong> {formatEther(market.noSharesSupply)} shares</p>
          <p><strong>Collateral pool:</strong> {formatEther(market.collateralPool)} MON</p>

          {position ? (
            <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3 text-sm text-purple-900">
              <p><strong>Your YES shares:</strong> {formatEther(position.yesShares)}</p>
              <p><strong>Your NO shares:</strong> {formatEther(position.noShares)}</p>
              <p><strong>Your net cash deposited:</strong> {formatEther(position.netCashDeposited)} MON</p>
            </div>
          ) : null}

          <form className="space-y-3" onSubmit={(e) => buy(true, e)}>
            <label className="block text-sm font-medium text-purple-900">Trade amount (shares)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={sharesInput}
              onChange={(e) => setSharesInput(e.target.value)}
              className="field w-full px-3 py-2"
            />
            <p className="text-sm text-purple-900">
              Estimated buy cost: YES {formatEther(quoteBuyTotal(parseSharesToWei() || BIG_ZERO, true))} MON, NO {formatEther(quoteBuyTotal(parseSharesToWei() || BIG_ZERO, false))} MON
            </p>
            <div className="flex flex-wrap gap-3">
              <button disabled={loading || market.status !== 0} onClick={(e) => void buy(true, e)} className="rounded-xl bg-purple-700 px-4 py-2 text-white disabled:opacity-50">Buy YES</button>
              <button disabled={loading || market.status !== 0} onClick={(e) => void buy(false, e)} className="rounded-xl bg-purple-500 px-4 py-2 text-white disabled:opacity-50">Buy NO</button>
              <button disabled={loading || market.status !== 0} type="button" onClick={() => void sell(true)} className="rounded-xl bg-purple-900 px-4 py-2 text-white disabled:opacity-50">Sell YES</button>
              <button disabled={loading || market.status !== 0} type="button" onClick={() => void sell(false)} className="rounded-xl bg-violet-900 px-4 py-2 text-white disabled:opacity-50">Sell NO</button>
            </div>
          </form>

          {isCreator ? (
            <div className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/40 p-3">
              <p className="text-sm"><strong>Creator Resolve</strong></p>
              {!canResolveNow ? <p className="text-sm text-purple-800">Resolve unlocks after close time.</p> : null}
              <div className="flex gap-3">
                <button
                  disabled={loading || market.status !== 0 || !canResolveNow}
                  onClick={() => setResolveChoice(true)}
                  className="rounded-xl bg-purple-700 px-4 py-2 text-white disabled:opacity-50"
                >
                  Resolve YES
                </button>
                <button
                  disabled={loading || market.status !== 0 || !canResolveNow}
                  onClick={() => setResolveChoice(false)}
                  className="rounded-xl bg-purple-500 px-4 py-2 text-white disabled:opacity-50"
                >
                  Resolve NO
                </button>
              </div>
            </div>
          ) : null}

          <button disabled={loading || market.status !== 1} onClick={() => void redeem()} className="rounded-xl bg-purple-800 px-4 py-2 text-white disabled:opacity-50">Redeem Winning Shares</button>
        </section>
      ) : null}

      {resolveChoice !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-purple-950/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-purple-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-purple-950">Confirm Resolution</h2>
            <p className="mt-2 text-sm text-purple-900">
              You are about to resolve this market as <strong>{resolveChoice ? "YES" : "NO"}</strong>. This action is final.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setResolveChoice(null)} className="rounded-xl border border-purple-300 px-3 py-2 text-sm text-purple-900" type="button">Cancel</button>
              <button
                onClick={() => {
                  void resolve(resolveChoice);
                  setResolveChoice(null);
                }}
                className="cta-button px-3 py-2 text-sm"
                type="button"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {statusText ? <p className="text-muted text-sm">{statusText}</p> : null}
    </main>
  );
}
