# Risks And Assumptions

## Assumptions
- Monad testnet RPC remains stable for development.
- MetaMask supports required chain switching flow.
- On-chain code mapping is sufficient for V1 retrieval.

## Risks
1. Oracle trust risk
- Creator may resolve dishonestly.
- Mitigation: clear trust model and transparent history.

2. Payout math edge cases
- Incorrect rounding can cause dust or unfair payouts.
- Mitigation: explicit test vectors for different pool ratios.

3. Gas and UX friction
- Failed transactions due to wrong network or timing windows.
- Mitigation: strong client-side checks and clear action states.

4. Unresolved markets
- No fallback resolver in V1 can leave markets unresolved.
- Mitigation: clear UX warning and future V2 dispute model.
