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

## Current Status Snapshot (2026-03-17)
- Monad testnet deploy: complete.
- Latest AMM contract: 0xd0081cd6782cB27718462D8519e0f2A4fd41FA10.
- Legacy V1 contract: 0xeD5A4f0A0bF5dF8a19Fa7a9793334949dFDE45F4.
- Deployer/treasury: 0xc969D2c98c24bDA56fb5Dd2D01d14214FB8aE2d1.
- Frontend local port: 3069.
- Remaining: end-to-end two-wallet portfolio smoke flow against latest AMM address.
