# Architecture

## High-Level Components
1. Smart contracts (Hardhat project)
- Core market contract holds market state, bets, and claim accounting.
- On-chain mapping from OPEN code to marketId.
- Events for market lifecycle and user actions.

2. Frontend app (Next.js app router)
- Home route for create market and OPEN code entry.
- Market detail route by code for read, bet, resolve, claim actions.
- My Markets route for created and participated markets.

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

## Non-Goals in V1
- No off-chain indexer dependency for code lookup.
- No dispute workflow.
- No push-based mass payout on resolve.
