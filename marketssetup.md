# OpenMarketz Prediction Markets Setup

## What is implemented

### 1. Permissionless binary markets
- Anyone can create a market.
- Market type is binary only: YES / NO.
- Creation requires seeded liquidity:
  - YES seed >= 2 MON
  - NO seed >= 2 MON
  - Total seed >= 4 MON

### 2. Market identity and uniqueness
- Each market gets a unique code in format `OPEN##########`.
- Code generation is pseudo-random with collision checks.
- Reverts only if uniqueness cannot be achieved in bounded attempts.

### 3. Question + oracle metadata model
- Market now stores three separate content fields:
  - Question (main market prompt)
  - Oracle description (resolution criteria)
  - Oracle links (up to 5)
- Validation rules:
  - Question length: 1 to 300 chars
  - Oracle description length: 1 to 1000 chars
  - Links: max 5, each must look like `http://` or `https://`

### 4. In-app-wallet-only transaction mechanism
- Create/trade/resolve/claim are relayed operations.
- User signs EIP-712 typed data using in-app wallet key.
- Relayer submits tx onchain.
- Contracts recover signer and enforce permissions/nonces/deadlines.
- Resolution is creator-only.

## Contract architecture

### OpenMarketzVault
- Custody and accounting only.
- Tracks free/locked balances.
- Authorizes market contracts.
- Extended with `setMarketAuthorizer` so factory can authorize newly deployed markets.

### OpenMarketzMarketFactory
- Verifies create signatures.
- Enforces creation constraints and metadata limits.
- Generates unique OPEN codes.
- Deploys `OpenMarketzBinaryMarket` per market.
- Indexes creator -> markets and code -> market.

### OpenMarketzBinaryMarket
- Stores market code, question, oracle description.
- Handles relayed trade/resolve/claim.
- Uses vault lock/release for stake and payout settlement.

## Frontend flow

### Create market
1. User enters question.
2. User enters oracle description and links.
3. User sets YES/NO seed liquidity.
4. Frontend signs create payload using in-app wallet.
5. Frontend sends payload to `/api/relayer/create`.
6. Factory creates market and returns OPEN code.

### Access market
- Landing input bar takes OPEN + 10 digits.
- Frontend resolves code to market address and loads snapshot.

### Creator market list
- Frontend loads creator markets from factory.
- Displays creator's market codes for quick access.

## Relayer API routes
- `/api/relayer/create`
- `/api/relayer/trade`
- `/api/relayer/resolve`
- `/api/relayer/claim`

## Contract addresses you need in env

Only these contract addresses are required in environment configuration:

1. `NEXT_PUBLIC_VAULT_ADDRESS`
- Deployed `OpenMarketzVault` address.

2. `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS`
- Deployed `OpenMarketzMarketFactory` address.

Notes:
- Do not add `OpenMarketzBinaryMarket` to env; markets are deployed dynamically by the factory.
- For contract deployment scripts, the factory deploy step also needs the vault address as `VAULT_ADDRESS` input.

## Deployment order
1. Deploy vault.
2. Deploy market factory with vault address and relayer address.
3. From vault owner, call `setMarketAuthorizer(factoryAddress, true)`.
4. Set frontend contract addresses (vault + factory).

## Current status summary
- Contracts compile and tests pass.
- Frontend includes question + oracle description + links in create flow.
- Landing page can access markets by OPEN code.
- Creator market code listing is present.
