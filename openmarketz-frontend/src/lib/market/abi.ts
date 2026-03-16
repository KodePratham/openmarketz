export const marketFactoryAbi = [
  "function nonces(address) view returns (uint256)",
  "function hashLinks(string[] links) pure returns (bytes32)",
  "function createBinaryMarket((address creator,uint256 yesSeed,uint256 noSeed,string question,string oracleDescription,bytes32 linksHash,uint256 nonce,uint256 deadline) req,string[] links,bytes signature) returns (address)",
  "function getMarketByCode(string code) view returns (address)",
  "function getCreatorMarkets(address creator) view returns (address[])",
  "function getCreatorMarketCodes(address creator) view returns (string[])",
  "function getMarketCode(address market) view returns (string)",
  "function getMarketQuestion(address market) view returns (string)",
  "function getMarketOracleDescription(address market) view returns (string)",
  "function getMarketOracleLinks(address market) view returns (string[])",
  "event MarketCreated(address indexed market,address indexed creator,string code,uint256 yesSeed,uint256 noSeed,bytes32 linksHash)",
] as const;

export const binaryMarketAbi = [
  "function nonces(address) view returns (uint256)",
  "function creator() view returns (address)",
  "function marketCode() view returns (string)",
  "function marketQuestion() view returns (string)",
  "function oracleDescription() view returns (string)",
  "function marketState() view returns (uint8)",
  "function winningYes() view returns (bool)",
  "function totalYesStake() view returns (uint256)",
  "function totalNoStake() view returns (uint256)",
  "function trade((address trader,bool isYes,uint256 amount,uint256 nonce,uint256 deadline) req,bytes signature)",
  "function resolve((bool yesWins,uint256 nonce,uint256 deadline) req,bytes signature)",
  "function claim((address claimant,uint256 nonce,uint256 deadline) req,bytes signature)",
] as const;
