# AMM Redeployment Checklist

## Do We Need Redeploy For OPEN 10-Digit Code?
Yes.

Reason:
- `OpenMarketzAMM` bytecode changed (new code field, mapping, helpers, event payload).
- ABI changed (`MarketCreated` event + `getMarketIdByOpenCode` + `formatOpenCode` + market struct field order).
- Existing deployed AMM address does not have these capabilities.

## Redeploy Steps
1. Open terminal in `openmarketz-contracts`.
2. Ensure `.env` has:
   - `MONAD_RPC_URL`
   - `PRIVATE_KEY`
   - optional `TREASURY_ADDRESS` (defaults to deployer when missing)
3. Run:
   - `npm run deploy:amm:testnet`
4. Copy the printed AMM contract address.

## Post-Deploy Required Actions
1. Update frontend env:
   - `openmarketz-frontend/.env.local`
   - set `NEXT_PUBLIC_OPENMARKETZ_AMM_ADDRESS=<new_address>`
2. Restart frontend dev server.
3. Verify flow:
   - create AMM market
   - receive `OPEN##########`
   - open market by code

## Quick Risk Notes
- Frontend with old AMM address + new ABI will fail at runtime.
- If redeploy is skipped, OPEN code lookup in AMM UI cannot work.
