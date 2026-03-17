import { Contract, JsonRpcProvider, Signer } from "ethers";

export const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
export const OPENMARKETZ_ADDRESS = process.env.NEXT_PUBLIC_OPENMARKETZ_ADDRESS || "";

export const openMarketzAbi = [
  "function createMarket(string question, string description, uint64 closeTime) returns (uint256 marketId, uint64 code)",
  "function placeBet(uint256 marketId, bool yesSide) payable",
  "function resolveMarket(uint256 marketId, bool outcomeYes)",
  "function claimPayout(uint256 marketId) returns (uint256 payoutAmount, uint256 feeAmount)",
  "function cancelMarket(uint256 marketId)",
  "function getMarketIdByOpenCode(string openCode) view returns (uint256 marketId)",
  "function getMarket(uint256 marketId) view returns ((address creator, string question, string description, uint64 createdAt, uint64 closeTime, uint64 code, uint256 totalYesPool, uint256 totalNoPool, bool outcomeYes, uint8 status) market)",
  "function getCreatedMarkets(address user) view returns (uint256[] memory)",
  "function getParticipatedMarkets(address user) view returns (uint256[] memory)",
  "function formatOpenCode(uint64 code) pure returns (string memory)",
  "event MarketCreated(uint256 indexed marketId, uint64 indexed code, address indexed creator, string question, uint64 closeTime)",
] as const;

export function getReadContract() {
  if (!OPENMARKETZ_ADDRESS) {
    throw new Error("NEXT_PUBLIC_OPENMARKETZ_ADDRESS is not set");
  }

  const provider = new JsonRpcProvider(MONAD_RPC_URL);
  return new Contract(OPENMARKETZ_ADDRESS, openMarketzAbi, provider);
}

export function getWriteContract(signer: Signer) {
  if (!OPENMARKETZ_ADDRESS) {
    throw new Error("NEXT_PUBLIC_OPENMARKETZ_ADDRESS is not set");
  }

  return new Contract(OPENMARKETZ_ADDRESS, openMarketzAbi, signer);
}
