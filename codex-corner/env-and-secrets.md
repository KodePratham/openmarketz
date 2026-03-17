# Env And Secrets

## Frontend .env.local.example
- NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
- NEXT_PUBLIC_MONAD_CHAIN_ID=10143
- NEXT_PUBLIC_OPENMARKETZ_ADDRESS=replace_with_deployed_v1_contract_address
- NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS=replace_with_deployed_v2_amm_contract_address

## Where To Add Deployed Contract Address
- Add deployed addresses in openmarketz-frontend/.env.local.
- V1 contract goes to NEXT_PUBLIC_OPENMARKETZ_ADDRESS.
- V2 AMM contract goes to NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS.
- Restart frontend dev server after editing env values.
- Latest AMM deployment (2026-03-17): 0xd0081cd6782cB27718462D8519e0f2A4fd41FA10.

## Contracts .env.example
- MONAD_RPC_URL=https://testnet-rpc.monad.xyz
- PRIVATE_KEY=replace_with_testnet_private_key_no_0x
- TREASURY_ADDRESS=optional_treasury_address

## Deployment Commands (Selective)

Run from openmarketz-contracts.

1. Deploy only V1 (OpenMarketz): npm run deploy:testnet
2. Deploy only V2 (OpenMarketzAMM): npm run deploy:amm:testnet
3. Deploy both intentionally:
	- npm run deploy:testnet
	- npm run deploy:amm:testnet

Notes:
- Each command deploys only its target script.
- If TREASURY_ADDRESS is blank or optional_treasury_address, deployer is used as treasury.
- If you see package.json not found, you are in the wrong folder. cd openmarketz-contracts first.

## Security Notes
- Never commit private keys.
- Use testnet-only keys in V1.
- Use separate deployer wallet from personal wallet.
- Rotate keys if exposed.

## Operational Notes
- Treasury defaults to deployer for first deployment.
- Deploy script validates TREASURY_ADDRESS and rejects non-address strings.
- Keep a deployment log in codex-corner/journey-log.md.
