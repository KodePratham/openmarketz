# Journey Log

## 2026-03-17 Session 1
- Aligned V1 scope and constraints through structured Q&A.
- Confirmed contracts-first workflow with Hardhat.
- Confirmed frontend app name: openmarketz-frontend.
- Confirmed Monad testnet and MetaMask-only wallet support.
- Confirmed fee model: 200 bps on winnings to treasury (deployer first).
- Confirmed code strategy: pseudo-random unique 10-digit OPEN code with on-chain mapping.
- Added codex-corner as Phase 0 mandatory documentation backbone.

## Next Milestones
- Scaffold frontend and contracts.
- Implement core contract flows and tests.
- Deploy to Monad testnet.
- Integrate frontend with deployed contract.

## 2026-03-17 Session 2
- Created codex-corner documentation backbone and daily journaling structure.
- Scaffoled openmarketz-frontend via Next.js app router + TypeScript + Tailwind.
- Initialized openmarketz-contracts with Hardhat + TypeScript + OpenZeppelin.
- Implemented V1 contract logic in OpenMarketz.sol:
	- create, bet, cancel-before-bet, resolve-after-close, claim payout with fee.
	- OPEN code generation, formatting, parsing, and code-to-market lookup.
	- created and participated market views.
- Added deploy script and initial contract tests.
- Resolved Hardhat toolchain compatibility issues and stabilized on Hardhat v2-compatible setup.
- Contract checks: compile pass, tests pass (4).
- Frontend implementation baseline completed:
	- / create + code open
	- /market/[code] detail + bet + resolve + claim
	- /my-markets created + participated views
- Frontend lint check passes.

## Updated Immediate Milestones
- Add frontend env example and wire deployed contract address.
- Run first Monad testnet deployment and record address.
- Execute end-to-end two-wallet smoke flow against testnet.

## 2026-03-17 Session 3
- Fixed editor-level TypeScript diagnostics in contract tests and market page.
- Confirmed clean checks after fixes:
	- contracts tests: 4 passing
	- frontend lint: passing
- Added frontend environment template: openmarketz-frontend/.env.local.example.

## 2026-03-17 Session 4
- Investigated testnet deployment failure: HardhatEthersProvider.resolveName NotImplementedError.
- Root cause: TREASURY_ADDRESS was set to a placeholder string instead of a 0x address.
- Hardened scripts/deploy.ts to:
	- default treasury to deployer when TREASURY_ADDRESS is blank or placeholder.
	- validate TREASURY_ADDRESS and fail with clear message when invalid.
- Updated contracts .env.example to use empty TREASURY_ADDRESS default.
- Successful Monad testnet deployment completed:
	- deployer: 0xc969D2c98c24bDA56fb5Dd2D01d14214FB8aE2d1
	- treasury: 0xc969D2c98c24bDA56fb5Dd2D01d14214FB8aE2d1
	- contract: 0xeD5A4f0A0bF5dF8a19Fa7a9793334949dFDE45F4
- Frontend local runtime target standardized to localhost:3069.

## 2026-03-17 Session 5
- Ran deep design Q&A to finalize AMM economics and settlement policy for V2.
- Locked decisions:
	- AMM market path with creator seed >= 2 MON.
	- Bootstrap equivalence of 2 YES + 2 NO at creation.
	- Creator-only liquidity top-up.
	- Trade fee 50 bps, split 70% LP and 30% treasury.
	- Strict immutable winner fee 2% on profit only.
	- Creator resolves; unresolved auto-cancel after 24h.
	- Refund basis on cancel uses trader net cash ledger.
	- V1 remains untouched; V2 ships as separate contract.
- Started implementation:
	- Added new contract: openmarketz-contracts/contracts/OpenMarketzAMM.sol.
	- Added deployment script: openmarketz-contracts/scripts/deploy-amm.ts.
	- Added test baseline: openmarketz-contracts/test/OpenMarketzAMM.test.ts.
	- Added package script: deploy:amm:testnet.
- Updated codex-corner contract and risk docs with finalized policy and implementation baseline notes.

## Next Milestones
- Complete full LMSR pricing integration in OpenMarketzAMM trade path.
- Add transferable LP-token fee-entitlement mechanics and tests.
- Integrate frontend market route for V1/V2 mode handling and AMM actions.

## 2026-03-17 Session 6
- Shifted product direction to AMM-only showcase MVP on frontend.
- Confirmed behavioral decisions for MVP:
	- AMM code source: on-chain.
	- Code format: OPEN + 10 random digits.
	- Open method: code-only in UI.
	- Creator resolve only after close; show close/deadline countdown.
	- Resolve UX: YES/NO buttons with confirmation modal.
	- Close time UX: calendar date picker plus time dropdowns.
	- Time display: both local and UTC.
- Implemented OpenMarketzAMM contract code identity support:
	- Added uint64 market code in state.
	- Added codeToMarketId mapping.
	- Added bounded unique code generation.
	- Added getMarketIdByOpenCode + formatOpenCode.
	- Updated MarketCreated event payload to include code.
- Expanded AMM tests to cover OPEN code emission/format/lookup and invalid code rejection.
- Frontend updates in progress:
	- Removed V1 routes from active app surface.
	- Home page now AMM-only create + AMM open-by-code.
	- Added calendar-based close date and time dropdown controls.
	- AMM detail page now resolves OPEN code to marketId and includes creator resolve confirmation modal.

## 2026-03-17 Session 7
- Implemented AMM wallet portfolio indexing in contract:
	- Added `getCreatedMarkets(address)` and `getParticipatedMarkets(address)`.
	- Added on-write tracking with participation dedupe guard.
- Extended AMM tests for created/invested getter behavior and duplicate prevention.
- Verified contract suite passes (OpenMarketz + OpenMarketzAMM).
- Refactored frontend home dashboard to getter-based hydration (removed event-log scan dependency).
- Added portfolio loader utility with short session cache for faster rehydration.
- Added dedicated `/my-markets` route with search/filter/sort and refresh.
- Improved dashboard polish with skeleton loaders, clearer empty states, status chips, and explicit refresh controls.
- Redeployed AMM to Monad testnet after getter changes:
	- contract: 0xd0081cd6782cB27718462D8519e0f2A4fd41FA10
	- deployer/treasury: 0xc969D2c98c24bDA56fb5Dd2D01d14214FB8aE2d1

## 2026-03-18 Session 1
- Clarified post-create liquidity behavior: seed at create, creator top-up later while OPEN.
- Implemented creator-only liquidity top-up panel on AMM market page.
- Added low-liquidity warning threshold at collateral pool below 3 MON.
- Added My Markets quick action to jump directly to liquidity top-up panel.
- Implemented landing hero stats section with on-chain aggregation:
	- total markets created
	- total transactions (create/trade/liquidity/resolve/redeem)
	- total volume processed (create + liquidity + trades + redemptions)
	- cumulative all-time liquidity (seed + top-ups)
	- unique users across tracked actions
- Added chunked event scan helper for better RPC resilience and partial-warning behavior.

## 2026-03-18 Session 2
- Started implementation for redeploy + stats loading failure.
- Deployed fresh AMM on Monad testnet:
	- contract: 0xc8B903577De4fC35f8c22E66a3587f3D0824Cba3
	- txHash: 0xa215da157cf18a65b2d586496752b0d647249df0093e0a47f19abd36c4abe33c
	- block: 19614389
	- deployer/treasury: 0xc969D2c98c24bDA56fb5Dd2D01d14214FB8aE2d1
- Improved deploy script output to include tx hash and block for deterministic frontend stats wiring.
- Updated frontend env target to latest AMM deployment and set `NEXT_PUBLIC_OPENMARKETZ_START_BLOCK` to deployment block.
- Hardened protocol stats loader:
	- RPC timeout handling
	- chainId verification
	- start block and scan-range validation
	- clearer surfaced error messages
- Updated landing page to display actionable stats error reason and keep retry control.

## 2026-03-19 Session 1
- Replaced client-side full history stats scan on home load with server-side cached stats delivery.
- Added Vercel KV-backed stats cache layer with stale-while-revalidate behavior.
- Added API routes:
	- GET /api/stats for fast snapshot reads
	- POST /api/stats/refresh for forced daily refresh
- Added daily Vercel cron schedule to refresh stats snapshots once every 24 hours.
- Added refresh endpoint guard via STATS_CRON_SECRET header/bearer check.
- Updated homepage stats loader to fetch cached API snapshot and show refreshed time from cache metadata.
- Updated frontend visual system to #6e54ff + white and removed heavy box-shadow styling accents.
- Swapped typography to Instrument Sans body + Libre Baskerville heading accents.
- Updated codex-corner frontend spec to document new cache-first landing stats behavior.
