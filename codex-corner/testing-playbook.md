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
