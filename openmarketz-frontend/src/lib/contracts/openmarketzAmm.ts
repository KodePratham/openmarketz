import { Contract, JsonRpcProvider, Signer } from "ethers";

export const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
export const OPENMARKETZ_AMM_ADDRESS = process.env.NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS || "";

export const openMarketzAmmAbi = [
  "function nextMarketId() view returns (uint256)",
  "function createMarket(string question, string description, uint64 closeTime) payable returns (uint256 marketId)",
  "function addLiquidity(uint256 marketId) payable returns (uint256 mintedShares)",
  "function buyYes(uint256 marketId, uint256 shares) payable returns (uint256 grossCost, uint256 fee)",
  "function buyNo(uint256 marketId, uint256 shares) payable returns (uint256 grossCost, uint256 fee)",
  "function sellYes(uint256 marketId, uint256 shares) returns (uint256 grossProceeds, uint256 fee)",
  "function sellNo(uint256 marketId, uint256 shares) returns (uint256 grossProceeds, uint256 fee)",
  "function resolveMarket(uint256 marketId, bool outcomeYes)",
  "function redeemWinningShares(uint256 marketId) returns (uint256 netPayout, uint256 winnerFee)",
  "function triggerAutoCancel(uint256 marketId)",
  "function claimCancelRefund(uint256 marketId) returns (uint256 amount)",
  "function getMarket(uint256 marketId) view returns ((address creator, string question, string description, uint64 createdAt, uint64 closeTime, uint64 code, uint64 resolveDeadline, bool outcomeYes, uint8 status, uint256 yesSharesSupply, uint256 noSharesSupply, uint256 collateralPool, uint256 totalLpShares, uint256 lmsrB, uint256 treasuryTradeFeesAccrued, uint256 lpTradeFeesAccrued, uint256 treasuryWinnerFeesAccrued, uint256 winnerPayoutPerShare, uint256 winningSharesSupplySnapshot) market)",
  "function getMarketIdByOpenCode(string openCode) view returns (uint256 marketId)",
  "function getCreatedMarkets(address user) view returns (uint256[] marketIds)",
  "function getParticipatedMarkets(address user) view returns (uint256[] marketIds)",
  "function formatOpenCode(uint64 code) pure returns (string)",
  "function getImpliedPriceBps(uint256 marketId, bool yesSide) view returns (uint256)",
  "function traderPositions(uint256 marketId, address trader) view returns (uint256 yesShares, uint256 noShares, uint256 yesCostBasis, uint256 noCostBasis, uint256 netCashDeposited, bool refundClaimed)",
  "event MarketCreated(uint256 indexed marketId, uint64 indexed code, address indexed creator, string question, uint64 closeTime, uint256 seedCollateral)",
  "event LiquidityAdded(uint256 indexed marketId, address indexed provider, uint256 amount, uint256 mintedLpShares)",
  "event SharesBought(uint256 indexed marketId, address indexed trader, bool yesSide, uint256 shares, uint256 grossCost, uint256 fee)",
  "event SharesSold(uint256 indexed marketId, address indexed trader, bool yesSide, uint256 shares, uint256 grossProceeds, uint256 fee)",
  "event MarketResolved(uint256 indexed marketId, bool outcomeYes, address indexed resolver, uint256 payoutPerWinningShare)",
  "event WinnerRedeemed(uint256 indexed marketId, address indexed trader, uint256 grossPayout, uint256 winnerFee, uint256 netPayout)",
] as const;

export function getAmmReadContract() {
  if (!OPENMARKETZ_AMM_ADDRESS) {
    throw new Error("NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS is not set");
  }

  const provider = new JsonRpcProvider(MONAD_RPC_URL);
  return new Contract(OPENMARKETZ_AMM_ADDRESS, openMarketzAmmAbi, provider);
}

export function getAmmWriteContract(signer: Signer) {
  if (!OPENMARKETZ_AMM_ADDRESS) {
    throw new Error("NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS is not set");
  }

  return new Contract(OPENMARKETZ_AMM_ADDRESS, openMarketzAmmAbi, signer);
}
