# Contract Spec

## Core Keys
- marketId: canonical identifier.
- OPEN code: 10-digit numeric code mapped to marketId.

## Market State (Draft)
- creator
- question
- description
- createdAt
- closeTime
- totalYesPool
- totalNoPool
- resolved
- outcome (YES/NO)
- canceled

## Global Config
- feeBps = 200
- treasury address
- nextMarketId counter
- codeToMarketId mapping

## Function Rules (Draft)
1. createMarket(question, description, closeTime)
- closeTime must be in the future.
- generate unique 10-digit code via nonce + creator + timestamp entropy with bounded retries.
- store market and code mapping.
- emit MarketCreated.

2. placeBet(marketId, side)
- market must exist and not be canceled.
- now <= closeTime.
- msg.value > 0.
- accumulate pool and user stake.
- emit BetPlaced.

3. cancelMarket(marketId)
- only creator.
- only before first bet.
- mark canceled.
- emit MarketCanceled.

4. resolveMarket(marketId, outcome)
- only creator.
- now > closeTime.
- not canceled and not already resolved.
- set outcome and resolved flag.
- emit MarketResolved.

5. claimPayout(marketId)
- market resolved.
- caller has winning stake.
- not already claimed.
- payout = pro-rata share from net pool after fee.
- mark claimed before transfer.
- transfer payout to caller.
- transfer fee portion to treasury.
- emit PayoutClaimed.

## Security Priorities
- Reentrancy protection on payout flow.
- Strict claim bookkeeping to prevent double claim.
- Correct payout and fee math under all pool distributions.
