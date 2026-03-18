# Release Checklist

## Contracts
- Compile clean.
- Test suite passes.
- Deployment config points to Monad testnet.
- V1 deploy command verified: npm run deploy:testnet.
- V2 deploy command verified: npm run deploy:amm:testnet.
- Deployed addresses recorded for each contract used.

## Frontend
- Build succeeds.
- Wallet connect and network checks work.
- Routes load without runtime errors.
- Env wiring validated in openmarketz-frontend/.env.local:
	- NEXT_PUBLIC_OPENMARKETZ_ADDRESS (V1)
	- NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS (V2)
	- NEXT_PUBLIC_OPENMARKETZ_START_BLOCK (stats scan floor)
- Landing stats checks:
	- Stats load without hard-fail state.
	- Stats errors are actionable when they occur.
	- Partial-warning mode appears only on event-scan partial failures.

## Functional Flow
- Create -> Bet -> Resolve -> Claim works with two wallets.
- Fee destination validated.
- AMM V2 flow works with two wallets:
	- Create market with >=2 MON seed
	- Buy/Sell shares
	- Live polling updates visible every 2-3 seconds
	- Resolve and redeem flow validated
- Portfolio visibility checks:
	- Creator wallet sees created market in `/` summary and `/my-markets`
	- Trader wallet sees invested market after buy in `/` summary and `/my-markets`
	- Created markets are not duplicated under invested view
	- Manual refresh and account switch both rehydrate lists

## Documentation
- Specs match deployed behavior.
- Journey logs updated with commands and outcomes.
- Known limitations documented.
- Deployment docs explicitly explain how to deploy only one contract.
- Deployment docs explicitly explain where to add deployed addresses in frontend env.

## Current Status Snapshot (2026-03-18)
- Monad testnet deploy: complete.
- Latest AMM contract: 0xc8B903577De4fC35f8c22E66a3587f3D0824Cba3.
- Latest AMM deploy tx: 0xa215da157cf18a65b2d586496752b0d647249df0093e0a47f19abd36c4abe33c.
- Latest AMM deployment block: 19614389.
- Legacy V1 contract: 0xeD5A4f0A0bF5dF8a19Fa7a9793334949dFDE45F4.
- Deployer/treasury: 0xc969D2c98c24bDA56fb5Dd2D01d14214FB8aE2d1.
- Frontend local port: 3069.
- Remaining: full two-wallet AMM flow (create, top-up, trade, resolve, redeem) plus landing stats movement validation.
