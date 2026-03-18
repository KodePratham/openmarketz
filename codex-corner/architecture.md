# Architecture

## High-Level Components
1. Smart contracts (Hardhat project)
- Core market contract holds market state, bets, and claim accounting.
- On-chain mapping from OPEN code to marketId.
- Events for market lifecycle and user actions.

2. Frontend app (Next.js app router)
- Home route for create market and OPEN code entry.
- Home route includes protocol stats hero aggregated from on-chain events.
- Market detail route by code for read, bet, resolve, claim actions.
- Market detail route includes creator-only post-create liquidity top-up.
- Dedicated My Markets route for created and invested market portfolios.

3. Chain and wallet
- Monad testnet, chainId 10143.
- Native MON token for betting and payout.
- MetaMask as only wallet in V1.

## Data Flow
1. User connects wallet.
2. User creates market with question, description, close time.
3. Contract assigns marketId and OPEN code; emits MarketCreated.
4. User shares OPEN code.
5. Bettors place YES/NO bets until close time.
6. Creator resolves market after close.
7. Winners claim payout; protocol fee routed to treasury.
8. Portfolio routes hydrate via `getCreatedMarkets(address)` and `getParticipatedMarkets(address)`.
9. Frontend hydrates market cards by id with `getMarket(id)` + `formatOpenCode(code)`.
10. Home summary and `/my-markets` share same portfolio loader with short session cache.
11. Landing stats load once per page using chunked event scans for MarketCreated, LiquidityAdded, SharesBought, SharesSold, MarketResolved, and WinnerRedeemed.
12. Stats formulas:
 - Total markets: MarketCreated count.
 - Total transactions: create + trade + liquidity + resolve + redeem event count.
 - Total volume processed: seed + top-up + buy grossCost + sell grossProceeds + redeem grossPayout.
 - Total liquidity: cumulative seed + top-up.
 - Unique users: unique addresses across creator/provider/trader/resolver in tracked events.
13. Stats reliability controls:
 - Frontend requires `NEXT_PUBLIC_OPENMARKETZ_START_BLOCK` to bound log scans near deployment.
 - RPC connectivity and chainId are validated before scanning.
 - Stats loader fails fast for huge ranges and surfaces actionable error text.
 - Event-level failures are downgraded to warnings to keep partial stats visible.

## Non-Goals in V1
- No off-chain indexer dependency for code lookup.
- No dispute workflow.
- No push-based mass payout on resolve.
