# Scope Showcase AMM

## Included
- AMM yes/no market creation with required close time and seed >= 2 MON.
- On-chain AMM OPEN code generation and OPEN->marketId lookup.
- On-chain wallet portfolio getters for created/invested market ids.
- Calendar-based close date selection with time dropdown in create flow.
- Local + UTC close-time display.
- Buy/sell AMM shares with live market polling.
- Dedicated `/my-markets` route with search/filter/sort for created and invested cards.
- Creator-only resolution after close time.
- Resolve deadline visibility (close + 24h) and countdown.
- Winner redeem flow after resolve.
- Resolve confirmation modal (YES/NO) for creators.

## Excluded
- V1 UI routes and V1 market interactions.
- Dispute/fallback resolver override before auto-cancel.
- WalletConnect and additional wallets.
- Global market discovery feed.
- Mainnet deployment.
- CI pipeline setup.

## Acceptance Criteria
- AMM market creation from UI returns OPEN code.
- AMM market opens by OPEN code only.
- Users reliably see their created and invested markets quickly after refresh/connect.
- Trade after close is rejected.
- Non-creator resolve fails.
- Creator resolve before close fails.
- Creator resolve after close succeeds through confirmation modal.
- Winners redeem after resolve.
- Resolve deadline countdown is visible.
