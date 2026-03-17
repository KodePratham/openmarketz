# Frontend Spec

## Routes
1. /
- Wallet connect (MetaMask).
- Create market form: question, description, close time.
- OPEN code input and navigate to market detail.

2. /market/[code]
- Resolve code to marketId via contract view.
- Display metadata, status, and pool totals.
- Bet controls for YES/NO before close.
- Resolve controls for creator after close.
- Claim controls for winners after resolve.

3. /my-markets
- Created markets for connected wallet.
- Participated markets for connected wallet.
- Status display: open, closed-unresolved, resolved, canceled.

## Wallet and Network
- MetaMask only.
- Enforce Monad testnet chainId 10143.
- Prompt add/switch network when needed.

## Transaction UX
- Pending, success, and error states for each action.
- Disable submit during pending transaction.
- Show transaction hash link field placeholder for future explorer support.

## Validation
- Prevent empty question.
- Require close time in future.
- Require bet amount > 0.
- Block actions when wallet disconnected.
