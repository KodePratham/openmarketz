# Release Checklist

## Contracts
- Compile clean.
- Test suite passes.
- Deployment config points to Monad testnet.
- Deployed address recorded.

## Frontend
- Build succeeds.
- Wallet connect and network checks work.
- Routes load without runtime errors.

## Functional Flow
- Create -> Bet -> Resolve -> Claim works with two wallets.
- Fee destination validated.

## Documentation
- Specs match deployed behavior.
- Journey logs updated with commands and outcomes.
- Known limitations documented.

## Current Status Snapshot (2026-03-17)
- Monad testnet deploy: complete.
- Deployed contract: 0xeD5A4f0A0bF5dF8a19Fa7a9793334949dFDE45F4.
- Deployer/treasury: 0xc969D2c98c24bDA56fb5Dd2D01d14214FB8aE2d1.
- Frontend local port: 3069.
- Remaining: end-to-end two-wallet smoke flow and fee validation on deployed contract.
