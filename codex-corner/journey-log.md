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
