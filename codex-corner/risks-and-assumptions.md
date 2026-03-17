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

## V2 AMM Additional Risks
1. Pricing-function correctness risk
- AMM price function bugs can misprice trades or create insolvency pressure.
- Mitigation: property tests for monotonicity, bounded outputs, and pool conservation.

2. Fee-accounting divergence risk
- Mismatch between fee accrual buckets and withdrawals can cause treasury/LP imbalance.
- Mitigation: explicit accumulator tests for buy/sell/redeem/cancel scenarios.

3. Cost-basis and winner-fee fairness risk
- Profit-only winner fee depends on accurate per-trader cost basis updates after partial sells.
- Mitigation: scenario tests for multi-buy, multi-sell, and full/partial redemption paths.

4. Auto-cancel refund solvency risk
- If accounting allows over-refund, unresolved cancellation can fail.
- Mitigation: maintain trader net-cash ledger and add invariant checks against contract balance.

5. LP representation migration risk
- Target model is transferable ERC-20 LP token with fee entitlement transferability.
- Mitigation: phase rollout with clear implementation checkpoints and transfer-related accounting tests.
