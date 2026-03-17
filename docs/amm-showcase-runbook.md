# AMM Showcase Runbook

## Goal
Demo AMM-only prediction flow with OPEN code and creator resolution UX.

## Prerequisites
- Fresh AMM deployment completed.
- Frontend env points to latest AMM address.
- Two funded testnet wallets in MetaMask.

## Demo Script
1. Connect Wallet A on home page (`/`).
2. Create AMM market:
   - Enter question/description.
   - Pick close date from calendar.
   - Pick time from dropdowns.
   - Seed at least 2 MON.
3. Confirm status returns `OPEN##########`.
4. Open same market by code from home input.
5. Before close:
   - Wallet B buys YES/NO shares.
   - Optionally sell part to show two-way trading.
6. Observe live updates:
   - prices, supplies, collateral, last refresh time.
7. After close time:
   - Creator sees resolve controls unlocked.
   - Click resolve YES/NO, approve confirmation modal.
8. Post-resolve:
   - winning wallet redeems winning shares.
9. Portfolio verification:
   - Wallet A confirms market appears under Created on `/` and `/my-markets`.
   - Wallet B confirms market appears under Invested after trade.

## Talking Points During Demo
- Close time gates resolution; creator cannot resolve before close.
- Resolve deadline is visible (`close + 24h`) with countdown.
- OPEN code is generated on-chain and maps to market id on-chain.

## Troubleshooting
- Market not found by code:
  - Check frontend AMM address is latest deployment.
- Portfolio empty after valid actions:
   - Confirm frontend points to AMM with getter support (`getCreatedMarkets`, `getParticipatedMarkets`).
- Resolve button disabled:
  - Ensure connected wallet is creator and close time has passed.
- Tx fail on create:
  - Ensure seed >= 2 MON and wallet is on Monad testnet.
