# OpenMarketz Contracts

This package contains the core smart contracts for OpenMarketz on Monad Testnet.

## OpenMarketzVault

The OpenMarketz vault is the protocol's custody layer for native MON. It is intentionally isolated from market business logic.

What the vault does:

- Accepts MON deposits from users into per-user free balances.
- Lets users withdraw from their free balances.
- Tracks locked balances used by market contracts during active positions.
- Lets authorized market contracts lock funds and release them between users after resolution.
- Tracks protocol fees separately and allows owner-only fee withdrawal.
- Supports emergency pause and an emergency owner drain while paused.

What the vault does not do:

- No market creation or resolution logic.
- No oracle resolution logic.
- No pricing, odds, or payout strategy logic.

## Security Model

- Uses OpenZeppelin Ownable for admin actions.
- Uses OpenZeppelin Pausable for emergency stop.
- Uses OpenZeppelin ReentrancyGuard on external fund-moving functions.
- Uses custom errors for gas-efficient reverts.
- Uses Checks-Effects-Interactions before native MON transfers.
- Uses low-level call for native transfers, never transfer/send.
- Restricts settlement operations to authorized market contracts.

## Accounting Model

The vault maintains:

- `balances[user]`: user free balance
- `lockedBalances[user]`: user locked balance
- `protocolFees`: accumulated protocol fee balance
- `totalVaultBalance`: total accounted holdings

Internal invariant checks assert that accounted totals match on-chain contract balance.

## Files

- `contracts/OpenMarketzVault.sol`: vault implementation.
- `deploy/deployVault.js`: Hardhat deployment script.
- `test/Vault.test.js`: Hardhat unit tests for core vault flows.
- `hardhat.config.js`: Hardhat config for Monad testnet (chainId 10143).
- `foundry.toml`: Foundry config with Monad RPC endpoint alias.
- `.env.example`: environment variable template.

## Setup

1. Install dependencies:

   bun install

2. Create `.env` from `.env.example` and fill values:

- `PRIVATE_KEY`
- `MONAD_TESTNET_RPC`

3. Compile:

   bun run compile

If you see `Nothing to compile`, that means Hardhat cache says artifacts are already up to date.

To force recompilation:

   bun run compile:force

To clear cache and do a fresh build:

   bun run compile:fresh

4. Test:

   bun run test

5. Deploy to Monad testnet:

   bun run deploy:monad

## Notes

- Solidity version: `0.8.24`
- Network target: Monad Testnet (`chainId: 10143`)
- Native token: MON