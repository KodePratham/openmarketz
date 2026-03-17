# 2026-03-17 Scaffold And Baseline

## Contracts Track
- Initialized openmarketz-contracts npm project.
- Added Hardhat TypeScript toolchain and OpenZeppelin dependency.
- Implemented OpenMarketz.sol with V1 lifecycle:
  - createMarket
  - placeBet
  - cancelMarket (before first bet)
  - resolveMarket (creator-only, after close)
  - claimPayout (pro-rata with fee)
- Added codeToMarketId mapping and OPEN code parsing/format helpers.
- Added created and participated market index views.
- Added deployment script scripts/deploy.ts.
- Added test suite test/OpenMarketz.test.ts.

## Contracts Validation
- Compile status: pass.
- Test status: 4 passing.

## Frontend Track
- Scaffolded Next.js app: openmarketz-frontend.
- Installed ethers.
- Added wallet helper for MetaMask and Monad chain switching.
- Added contract helper with ABI and read/write wrappers.
- Replaced home page with V1 create-market + code lookup UX.
- Added /market/[code] route for market read, bet, resolve, claim.
- Added /my-markets route for created and participated lists.

## Frontend Validation
- Lint status: pass.

## Notes
- Hardhat v3 toolbox mismatch was resolved by pinning to Hardhat v2-compatible stack.
- Deployment blocker resolved: invalid TREASURY_ADDRESS placeholder caused Hardhat resolveName failure.
- Deploy script now validates treasury input and safely falls back to deployer when unset.

## Validation Snapshot
- openmarketz-contracts
  - npm run compile: pass
  - npm run test: pass (4 passing)
- openmarketz-frontend
  - npm run lint: pass

## Follow-Up Required
- Execute end-to-end two-wallet smoke flow against deployed testnet contract.
- Validate fee routing on real trades and payout claims.

## Latest Advancement Update
- First Monad testnet deployment completed.
- Deployed contract: 0xeD5A4f0A0bF5dF8a19Fa7a9793334949dFDE45F4.
- Frontend environment now points to deployed address.
- Frontend local port target standardized to 3069.
