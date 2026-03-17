# Frontend Spec

## Routes
1. /
- Wallet connect (MetaMask).
- Create AMM market form: question, description, close date from calendar, close time dropdowns, seed >= 2 MON.
- Display close-time preview in both local timezone and UTC before submit.
- OPEN code input and navigate to AMM market detail.
- Home summary widgets for:
	- Your Created Markets
	- Markets You Invested In
- Dashboard refresh action and CTA to dedicated portfolio page.

2. /amm/[code]
- Resolve OPEN code to marketId via AMM contract view.
- Display AMM market metadata, status, implied YES/NO prices, and pool metrics.
- Buy/Sell controls for YES/NO while market is open.
- Show close countdown and resolve-deadline countdown.
- Show close/deadline in both local timezone and UTC.
- Creator resolve controls unlock only after close.
- Resolve action uses YES/NO confirmation modal.
- Redeem control for winning shares after resolve.
- Polling refresh every 2-3 seconds for live showcase updates.

3. /my-markets
- Dedicated wallet portfolio view for created and invested markets.
- Uses on-chain getter hydration via AMM contract (no full-history event scans).
- Search by OPEN code or question text.
- Status filter: All/Open/Resolved/Canceled.
- Sort options: newest, closing soon, OPEN code.
- Manual refresh action and wallet-change rehydration.

4. V1 route policy
- No active V1 UI routes in showcase MVP.
- V1 contract remains deployed but frontend does not surface V1 flows.

## Wallet and Network
- MetaMask only.
- Enforce Monad testnet chainId 10143.
- Prompt add/switch network when needed.

## Transaction UX
- Pending, success, and error states for each action.
- Disable submit during pending transaction.
- Show transaction hash link field placeholder for future explorer support.
- Show live refresh indicator and last updated time on AMM market route.
- Portfolio routes should show skeleton rows during hydration.
- Empty states should include a next-step CTA message.

## Validation
- Prevent empty question.
- Require close time in future.
- Require share amount > 0 for buys/sells.
- Block actions when wallet disconnected.
- OPEN code must match OPEN + 10 digits.
