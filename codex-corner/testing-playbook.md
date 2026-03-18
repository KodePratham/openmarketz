# Testing Playbook

## Contract Tests
- Create market success.
- Reject create with past close time.
- Place YES and NO bets success.
- Reject bet after close time.
- Reject resolve by non-creator.
- Reject resolve before close.
- Resolve success after close.
- Claim payout success for winner.
- Reject double claim.
- Cancel before first bet success.
- Reject cancel after first bet.
- Fee routed to treasury correctly.
- Created market getter returns creator market ids.
- Participated market getter returns deduped market ids per wallet.

## Frontend Checks
- Wallet connect and chain switch.
- Create form validation and tx feedback.
- Code lookup route behavior.
- Bet actions disabled/enabled by market state.
- Resolve action visible only for creator.
- Claim action visible only for winners after resolve.
- Creator liquidity top-up panel visible only for creator on OPEN markets.
- Low-liquidity warning appears when collateral pool is below 3 MON.
- My Markets created cards include working top-up quick action.
- Landing stats hero loads once, renders all five metrics, and handles failures with retry.
- Home page summary shows created and invested cards.
- `/my-markets` supports search, status filters, and sort changes.
- Portfolio refresh works and wallet account changes rehydrate lists.

## Manual End-To-End
1. Wallet A creates market.
2. Wallet B places bet.
3. Wait for close time.
4. Wallet A resolves outcome.
5. Winning wallet claims payout.
6. Validate treasury fee received.
7. Confirm wallet A sees market under created list.
8. Confirm wallet B sees same market under invested list after trade.
9. Wallet A adds liquidity days later and sees updated pool.
10. Verify landing stats increase for transactions, volume, and cumulative liquidity after top-up and trades.

## Stats Reliability Checks
1. Confirm frontend env uses latest AMM address and deployment start block.
2. Load home route and verify stats cards render with no hard-fail banner.
3. If stats fail, ensure message names actionable cause (missing AMM address, wrong chain, timeout, or start-block range).
4. Verify `Partial stats` warning only appears when one or more event scans fail.
5. Trigger one new create transaction and verify total markets and transactions increase.
