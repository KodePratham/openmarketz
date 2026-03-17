# Env And Secrets

## Frontend .env.local (current)
- NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
- NEXT_PUBLIC_MONAD_CHAIN_ID=10143
- NEXT_PUBLIC_OPENMARKETZ_ADDRESS=0xeD5A4f0A0bF5dF8a19Fa7a9793334949dFDE45F4

## Contracts .env (current shape)
- MONAD_RPC_URL=https://testnet-rpc.monad.xyz
- PRIVATE_KEY=<deployer_private_key>
- TREASURY_ADDRESS=<optional_0x_address_or_blank>

## Security Notes
- Never commit private keys.
- Use testnet-only keys in V1.
- Use separate deployer wallet from personal wallet.
- Rotate keys if exposed.

## Operational Notes
- Treasury defaults to deployer for first deployment.
- Deploy script validates TREASURY_ADDRESS and rejects non-address strings.
- Keep a deployment log in codex-corner/journey-log.md.
