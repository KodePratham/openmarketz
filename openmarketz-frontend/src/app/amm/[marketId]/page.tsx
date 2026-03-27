"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "ethers";
import type { Signer } from "ethers";
import { connectMetaMask } from "@/lib/wallet/metamask";
import {
  COLLATERAL_DECIMALS,
  OPENMARKETZ_AMM_ADDRESS,
  getAmmReadContract,
  getAmmWriteContract,
  getCollateralWriteContract,
} from "@/lib/contracts/openmarketzAmm";

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
const SHARE_SCALE = BigInt("1000000");
const TRADE_FEE_BPS = BigInt(50);
const WINNER_FEE_BPS = BigInt(200);
const POLL_MS = 2500;
const LOW_LIQUIDITY_THRESHOLD_WEI = parseUnits("3", COLLATERAL_DECIMALS);

type BuyQuoteBreakdown = {
  grossCost: bigint;
  tradeFee: bigint;
  totalCost: bigint;
};

type BuyWinningEstimate = {
  isProfit: boolean;
  netProfitAbs: bigint;
};

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
  const [selectedBuySideYes, setSelectedBuySideYes] = useState(true);
  const [liquidityInput, setLiquidityInput] = useState("1");
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
      const value = parseUnits(sharesInput || "0", COLLATERAL_DECIMALS);
      if (value <= BIG_ZERO) return null;
      return value;
    } catch {
      return null;
    }
  }

  function parseLiquidityToWei(): bigint | null {
    try {
      const value = parseUnits(liquidityInput || "0", COLLATERAL_DECIMALS);
      if (value <= BIG_ZERO) return null;
      return value;
    } catch {
      return null;
    }
  }

  async function ensureCollateralAllowance(owner: string, signer: Signer, requiredAmount: bigint): Promise<void> {
    if (!OPENMARKETZ_AMM_ADDRESS) {
      throw new Error("NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS is not set");
    }

    const usdc = getCollateralWriteContract(signer);
    const allowance = await usdc.allowance(owner, OPENMARKETZ_AMM_ADDRESS);
    if (allowance >= requiredAmount) return;

    const approveTx = await usdc.approve(OPENMARKETZ_AMM_ADDRESS, requiredAmount);
    await approveTx.wait();
  }

  function quoteBuyBreakdown(sharesWei: bigint, yesSide: boolean): BuyQuoteBreakdown {
    const priceBps = yesSide ? priceYesBps : priceNoBps;
    const gross = (sharesWei * priceBps) / BPS_DENOM;
    const tradeFee = (gross * TRADE_FEE_BPS) / BPS_DENOM;
    return {
      grossCost: gross,
      tradeFee,
      totalCost: gross + tradeFee,
    };
  }

  function quoteBuyTotal(sharesWei: bigint, yesSide: boolean): bigint {
    return quoteBuyBreakdown(sharesWei, yesSide).totalCost;
  }

  function quoteWinningEstimate(sharesWei: bigint, yesSide: boolean): BuyWinningEstimate | null {
    if (!market || sharesWei <= BIG_ZERO) return null;

    const sideSupply = yesSide ? market.yesSharesSupply : market.noSharesSupply;
    const projectedWinningSupply = sideSupply + sharesWei;
    if (projectedWinningSupply <= BIG_ZERO) return null;

    const buyQuote = quoteBuyBreakdown(sharesWei, yesSide);
    const projectedPool = market.collateralPool + buyQuote.grossCost;
    const projectedPayoutPerShare = (projectedPool * SHARE_SCALE) / projectedWinningSupply;
    const grossPayout = (sharesWei * projectedPayoutPerShare) / SHARE_SCALE;

    const grossProfit = grossPayout > buyQuote.totalCost ? grossPayout - buyQuote.totalCost : BIG_ZERO;
    const winnerFee = (grossProfit * WINNER_FEE_BPS) / BPS_DENOM;
    const netPayout = grossPayout - winnerFee;
    const isProfit = netPayout >= buyQuote.totalCost;
    const netProfitAbs = isProfit ? netPayout - buyQuote.totalCost : buyQuote.totalCost - netPayout;

    return {
      isProfit,
      netProfitAbs,
    };
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
      await ensureCollateralAllowance(wallet.address, signer, totalCost);
      const tx = yesSide
        ? await contract.buyYes(resolvedMarketId, sharesWei, totalCost)
        : await contract.buyNo(resolvedMarketId, sharesWei, totalCost);
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

  async function addLiquidity() {
    if (!resolvedMarketId) return;

    const amountWei = parseLiquidityToWei();
    if (!amountWei) {
      setStatusText("Enter a valid liquidity amount.");
      return;
    }

    try {
      setLoading(true);
      const wallet = await connectMetaMask();
      setAddress(wallet.address);
      const signer = await wallet.provider.getSigner();
      const contract = getAmmWriteContract(signer);

      await ensureCollateralAllowance(wallet.address, signer, amountWei);
      const tx = await contract.addLiquidity(resolvedMarketId, amountWei);
      await tx.wait();

      setStatusText(`Liquidity top-up confirmed (+${liquidityInput} USDC).`);
      setLiquidityInput("1");
      await loadMarket();
    } catch (error) {
      console.error(error);
      setStatusText("Liquidity top-up failed.");
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
  const canAddLiquidityNow = Boolean(market && market.status === 0 && nowUnix <= Number(market.closeTime));
  const isLowLiquidity = Boolean(market && canAddLiquidityNow && market.collateralPool < LOW_LIQUIDITY_THRESHOLD_WEI);
  const closeDate = market ? new Date(Number(market.closeTime) * 1000) : null;
  const deadlineDate = market ? new Date(Number(market.resolveDeadline) * 1000) : null;
  const closeCountdown = market ? formatCountdown(Number(market.closeTime), nowUnix) : "-";
  const deadlineCountdown = market ? formatCountdown(Number(market.resolveDeadline), nowUnix) : "-";
  const parsedSharesWei = parseSharesToWei();
  const estimatedYesCost = quoteBuyTotal(parsedSharesWei || BIG_ZERO, true);
  const estimatedNoCost = quoteBuyTotal(parsedSharesWei || BIG_ZERO, false);
  const selectedWinningEstimate =
    market && market.status === 0 && parsedSharesWei
      ? quoteWinningEstimate(parsedSharesWei, selectedBuySideYes)
      : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="shell-card gum-panel p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold sm:text-3xl">AMM Market {openCode || marketKey.toUpperCase()}</h1>
          <div className="flex gap-3">
            <Link href="/" className="ghost-button px-3 py-2 text-sm">Home</Link>
            <button onClick={connect} className="cta-button px-3 py-2 text-sm">
              {address ? "Connected" : "Connect"}
            </button>
          </div>
        </div>

        <div className="gum-note mt-4 p-3 text-sm">
          <p>Realtime mode: polling every 2.5s.</p>
          <p>{isRefreshing ? "Refreshing..." : "Stable"}</p>
          <p suppressHydrationWarning>Last updated: {isClient && lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : "-"}</p>
        </div>
      </div>

      {loading ? <p className="text-muted text-sm">Loading...</p> : null}
      {notFound ? <p className="text-sm font-medium">Market not found for this code.</p> : null}

      {market ? (
        <section className="shell-card space-y-4 p-4 sm:p-6">
          <p><strong>Code:</strong> {openCode}</p>
          <p><strong>Market ID:</strong> {market.id.toString()}</p>
          <p><strong>Question:</strong> {market.question}</p>
          <p><strong>Description:</strong> {market.description}</p>
          <p><strong>Creator:</strong> {market.creator}</p>

          <div className="gum-note p-3 text-sm">
            <p suppressHydrationWarning><strong>Close (local):</strong> {isClient ? closeDate?.toLocaleString() : "-"}</p>
            <p><strong>Close (UTC):</strong> {closeDate?.toUTCString()}</p>
            <p><strong>Time to close:</strong> {closeCountdown}</p>
            <p suppressHydrationWarning><strong>Resolve deadline (local):</strong> {isClient ? deadlineDate?.toLocaleString() : "-"}</p>
            <p><strong>Resolve deadline (UTC):</strong> {deadlineDate?.toUTCString()}</p>
            <p><strong>Time to auto-cancel window:</strong> {deadlineCountdown}</p>
          </div>

          <div className="oracle-panel p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span>YES Odds: {yesPricePct.toFixed(2)}%</span>
              <span>NO Odds: {noPricePct.toFixed(2)}%</span>
            </div>
            <div className="brand-progress h-5 overflow-hidden rounded-full">
              <div className="flex h-full">
                <div className="brand-progress-yes h-full" style={{ width: `${yesBarPct}%` }} />
                <div className="brand-progress-no h-full" style={{ width: `${noBarPct}%` }} />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span>YES side confidence</span>
              <span>NO side confidence</span>
            </div>
          </div>

          <p><strong>Status:</strong> {market.status === 0 ? "OPEN" : market.status === 1 ? "RESOLVED" : "CANCELED"}</p>
          <p><strong>YES supply:</strong> {formatUnits(market.yesSharesSupply, COLLATERAL_DECIMALS)} shares</p>
          <p><strong>NO supply:</strong> {formatUnits(market.noSharesSupply, COLLATERAL_DECIMALS)} shares</p>
          <p><strong>Collateral pool:</strong> {formatUnits(market.collateralPool, COLLATERAL_DECIMALS)} USDC</p>

          {isLowLiquidity ? (
            <div className="gum-note p-3 text-sm">
              <p><strong>Low liquidity warning:</strong> Pool is below 3 USDC.</p>
              <p>{isCreator ? "Top up liquidity to keep trading depth healthy." : "Creator may add more liquidity to improve trade depth."}</p>
            </div>
          ) : null}

          {isCreator ? (
            <div id="liquidity-panel" className="gum-note space-y-3 p-3">
              <p className="text-sm"><strong>Creator Liquidity Top-Up</strong></p>
              {!canAddLiquidityNow ? <p className="text-sm">Liquidity top-up is available only while market is OPEN.</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={liquidityInput}
                  onChange={(e) => setLiquidityInput(e.target.value)}
                  className="field w-full px-3 py-2"
                  placeholder="Amount in USDC"
                />
                <button
                  type="button"
                  disabled={loading || !canAddLiquidityNow}
                  onClick={() => void addLiquidity()}
                  className="cta-button px-4 py-2 disabled:opacity-50"
                >
                  Add Liquidity
                </button>
              </div>
            </div>
          ) : null}

          {position ? (
            <div className="gum-note p-3 text-sm">
              <p><strong>Your YES shares:</strong> {formatUnits(position.yesShares, COLLATERAL_DECIMALS)}</p>
              <p><strong>Your NO shares:</strong> {formatUnits(position.noShares, COLLATERAL_DECIMALS)}</p>
              <p><strong>Your net cash deposited:</strong> {formatUnits(position.netCashDeposited, COLLATERAL_DECIMALS)} USDC</p>
            </div>
          ) : null}

          <form className="space-y-3">
            <label className="block text-sm font-medium">Trade amount (shares)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={sharesInput}
              onChange={(e) => setSharesInput(e.target.value)}
              className="field w-full px-3 py-2"
            />
            <p className="text-sm">
              Estimated buy cost: YES {formatUnits(estimatedYesCost, COLLATERAL_DECIMALS)} USDC, NO {formatUnits(estimatedNoCost, COLLATERAL_DECIMALS)} USDC
            </p>

            <div className="gum-note space-y-2 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">Preview side:</span>
                <button
                  type="button"
                  onClick={() => setSelectedBuySideYes(true)}
                  className={`px-2 py-1 text-xs ${selectedBuySideYes ? "cta-button" : "ghost-button"}`}
                >
                  YES
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBuySideYes(false)}
                  className={`px-2 py-1 text-xs ${!selectedBuySideYes ? "cta-button" : "ghost-button"}`}
                >
                  NO
                </button>
              </div>

              {selectedWinningEstimate ? (
                <>
                  <p>
                    Estimated net profit: <strong>{selectedWinningEstimate.isProfit ? "+" : "-"}{formatUnits(selectedWinningEstimate.netProfitAbs, COLLATERAL_DECIMALS)} USDC</strong>
                  </p>
                  <p className="text-xs">
                    Estimate uses current pool/supply and your post-buy position. Final payout can change as others trade before resolution.
                  </p>
                </>
              ) : (
                <p>Enter a valid shares amount to preview winnings.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                disabled={loading || market.status !== 0}
                onClick={(e) => {
                  setSelectedBuySideYes(true);
                  void buy(true, e);
                }}
                className="cta-button px-4 py-2 disabled:opacity-50"
              >
                Buy YES
              </button>
              <button
                disabled={loading || market.status !== 0}
                onClick={(e) => {
                  setSelectedBuySideYes(false);
                  void buy(false, e);
                }}
                className="cta-button px-4 py-2 disabled:opacity-50"
              >
                Buy NO
              </button>
              <button disabled={loading || market.status !== 0} type="button" onClick={() => void sell(true)} className="ghost-button px-4 py-2 disabled:opacity-50">Sell YES</button>
              <button disabled={loading || market.status !== 0} type="button" onClick={() => void sell(false)} className="ghost-button px-4 py-2 disabled:opacity-50">Sell NO</button>
            </div>
          </form>

          {isCreator ? (
            <div className="gum-note space-y-2 p-3">
              <p className="text-sm"><strong>Creator Resolve</strong></p>
              {!canResolveNow ? <p className="text-sm">Resolve unlocks after close time.</p> : null}
              <div className="flex gap-3">
                <button
                  disabled={loading || market.status !== 0 || !canResolveNow}
                  onClick={() => setResolveChoice(true)}
                  className="cta-button px-4 py-2 disabled:opacity-50"
                >
                  Resolve YES
                </button>
                <button
                  disabled={loading || market.status !== 0 || !canResolveNow}
                  onClick={() => setResolveChoice(false)}
                  className="ghost-button px-4 py-2 disabled:opacity-50"
                >
                  Resolve NO
                </button>
              </div>
            </div>
          ) : null}

          <button disabled={loading || market.status !== 1} onClick={() => void redeem()} className="cta-button px-4 py-2 disabled:opacity-50">Redeem Winning Shares</button>
        </section>
      ) : null}

      {resolveChoice !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 p-4">
          <div className="oracle-panel w-full max-w-md p-5">
            <h2 className="text-lg font-semibold">Confirm Resolution</h2>
            <p className="mt-2 text-sm">
              You are about to resolve this market as <strong>{resolveChoice ? "YES" : "NO"}</strong>. This action is final.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setResolveChoice(null)} className="ghost-button px-3 py-2 text-sm" type="button">Cancel</button>
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
