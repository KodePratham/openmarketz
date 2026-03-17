# Scope V1

## Included
- Yes/no market creation with required close time.
- Market metadata: question, description, close timestamp.
- Unique OPEN code generation and on-chain code lookup.
- Betting with native MON only.
- Creator-only resolution after close time.
- Winner claim flow with pro-rata payout.
- Protocol fee: 200 bps on winnings to treasury.
- Market cancel by creator before first bet.
- My Markets: created markets and participated markets.

## Excluded
- Dispute/fallback resolver.
- Social reputation scoring.
- WalletConnect and additional wallets.
- Global market discover feed.
- Mainnet deployment.
- CI pipeline setup.

## Acceptance Criteria
- Market creation from UI returns OPEN code.
- Second wallet can place bet before close.
- Bet after close is rejected.
- Non-creator resolve fails.
- Creator resolve after close succeeds.
- Winner claim succeeds and double claim fails.
- Fee transfer to treasury is correct.
