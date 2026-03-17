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

## V2 AMM Spec (In Progress)

### Finalized Decisions
- Market engine: AMM-based binary market.
- AMM market code standard: OPEN<10-digit-random> generated on-chain.
- Initial seed requirement: minimum 2 MON at market creation.
- Bootstrap rule: creation seeds symmetric starting inventory equivalent to 2 YES and 2 NO shares.
- Market type scope: binary YES/NO only.
- Liquidity top-up: creator only.
- LP representation target: transferable ERC-20 LP token model (fees should follow holder).
- Trading fee: 50 bps on buys and sells.
- Trading fee split: 70% LP and 30% treasury.
- Winner fee: immutable strict 2% on profit only.
- Winner fee destination: treasury.
- Fee stacking rule: winner redemption applies winner fee only.
- Resolver authority: creator.
- Unresolved fallback: auto-cancel after close + 24h grace.
- Cancel refund basis: net cash deposited minus realized sell proceeds, with LP bearing market-making PnL.
- Migration policy: keep legacy OpenMarketz (V1) untouched and deploy separate OpenMarketzAMM.

### Core V2 Market State (Target)
- creator
- question
- description
- createdAt
- closeTime
- code (uint64, renders as OPEN + fixed 10 digits)
- resolveDeadline (closeTime + 24h)
- status (OPEN / RESOLVED / CANCELED)
- outcomeYes (on resolve)
- yes/no share supplies
- collateralPool
- liquidity parameter b (derived from initial seed, multiplier 1.0x)
- fee accumulators:
	- treasury trade fees
	- LP trade fees
	- treasury winner fees
- winner payout snapshot fields for deterministic redemption after resolve
- creator market index mapping: `createdMarketIds[user]`
- participant market index mapping: `participatedMarketIds[user]` + dedupe guard

### V2 Flow Rules (Current Implementation Baseline)
1. createMarket(question, description, closeTime)
- requires closeTime in future.
- requires seed >= 2 MON.
- generates unique 10-digit code with bounded collision retries.
- stores codeToMarketId mapping.
- creates OPEN market with symmetric bootstrap YES/NO shares.
- creator receives bootstrap inventory and initial LP accounting.

2. getMarketIdByOpenCode(openCode)
- validates OPEN prefix and 10-digit payload.
- returns mapped marketId or zero if not found.

3. formatOpenCode(code)
- renders uint64 code as OPEN########## for frontend display.

4. addLiquidity(marketId)
- creator only.
- allowed while OPEN.
- mints additional LP accounting shares proportional to pool state.

5. buyYes/buyNo(marketId, shares)
- OPEN and before closeTime.
- calculates gross trade cost from market price function.
- collects 50 bps trade fee.
- routes fee accounting to LP/treasury split.

6. sellYes/sellNo(marketId, shares)
- OPEN and before closeTime.
- holder must own shares.
- pays net proceeds after 50 bps fee.
- updates trader cost basis and net-cash ledger used by cancel refunds.

7. resolveMarket(marketId, outcome)
- creator only.
- only after closeTime.
- snapshots winner payout-per-share from collateral pool and winning supply.

8. redeemWinningShares(marketId)
- market must be RESOLVED.
- trader redeems winning shares.
- strict winner fee = 2% of profit only.
- fee accrues to treasury winner-fee bucket.

9. triggerAutoCancel(marketId)
- allowed if unresolved after resolveDeadline.
- sets market to CANCELED.

10. claimCancelRefund(marketId)
- market must be CANCELED.
- refund amount comes from trader net-cash ledger.

11. getCreatedMarkets(user)
- returns ordered list of marketIds created by the wallet.
- intended for frontend portfolio hydration without log scanning.

12. getParticipatedMarkets(user)
- returns deduped ordered list of marketIds where wallet has participated.
- participation is tracked on market creation seed and buy actions.

### Portfolio Indexing Notes (Implemented)
- Indexing is additive and does not modify prior fee/resolution semantics.
- `createMarket` tracks both creator ownership and creator participation.
- `buyYes`/`buyNo` track participation with single-entry dedupe per marketId.
- Frontend should still exclude `created` ids from `invested` section to avoid duplicate cards.

### Implementation Note
- Current baseline starts AMM transition and fee architecture in a new contract.
- Next iteration upgrades pricing path to full LMSR math implementation while preserving finalized fee and settlement policy.
