# OpenMarketz Contracts

Hardhat workspace for OpenMarketz V1 and OpenMarketzAMM V2 deployments.

## Setup

```bash
cd openmarketz-contracts
npm install
cp .env.example .env
```

Fill `.env`:

```env
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
PRIVATE_KEY=your_testnet_private_key
TREASURY_ADDRESS=
COLLATERAL_TOKEN_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

Notes:
- `TREASURY_ADDRESS` is optional. If empty, deployment defaults treasury to deployer address.
- Never commit real private keys.

## Build and Test

```bash
npm run compile
npm run test
```

## Deploy Only One Contract

### Deploy V1 only (OpenMarketz)

```bash
npm run deploy:testnet
```

This runs `scripts/deploy.ts` and deploys only `OpenMarketz`.

### Deploy V2 only (OpenMarketzAMM)

```bash
npm run deploy:amm:testnet
```

This runs `scripts/deploy-amm.ts` and deploys only `OpenMarketzAMM`.

### Deploy V2 on Sepolia (USDC collateral)

```bash
npm run deploy:amm:sepolia
```

Defaults to Sepolia USDC if `COLLATERAL_TOKEN_ADDRESS` is not set.

### Deploy both (optional)

```bash
npm run deploy:testnet
npm run deploy:amm:testnet
```

## Common Error

If you see `Could not read package.json` when deploying, run commands from `openmarketz-contracts`:

```bash
cd openmarketz-contracts
npm run deploy:testnet
```

## After Deploy

Copy deployed addresses to frontend env in `openmarketz-frontend/.env.local`:

```env
NEXT_PUBLIC_OPENMARKETZ_ADDRESS=0x...      # V1
NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS=0x...  # V2
```

Restart frontend dev server after env changes.
