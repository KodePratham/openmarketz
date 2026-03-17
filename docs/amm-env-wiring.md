# AMM Env Wiring

## Contracts Side
File: `openmarketz-contracts/.env`

Required:
- `MONAD_RPC_URL=https://testnet-rpc.monad.xyz`
- `PRIVATE_KEY=<testnet_private_key_without_0x>`

Optional:
- `TREASURY_ADDRESS=<0x...>`

Notes:
- If `TREASURY_ADDRESS` is missing, deployer is used as treasury.

## Frontend Side
File: `openmarketz-frontend/.env.local`

Required:
- `NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz`
- `NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS=<latest_amm_contract_address>`

Optional legacy var:
- `NEXT_PUBLIC_OPENMARKETZ_ADDRESS` can remain but is not used in AMM-only UI.

## Validation
1. Start frontend: `npm run dev`
2. Create AMM market on `/`
3. Confirm status shows `AMM market created: OPEN##########`
4. Open AMM market by code from home page.
