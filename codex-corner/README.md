# Codex Corner

This folder is the source of truth for implementation details, engineering decisions, and build journey logs for OpenMarketz.

## Purpose
- Capture decisions and tradeoffs before and during implementation.
- Keep contract and frontend behavior aligned.
- Preserve a chronological journey of what changed and why.
- Make handoff and future audits easy.

## Document Index
- vision.md
- scope-v1.md
- architecture.md
- contract-spec.md
- frontend-spec.md
- env-and-secrets.md
- risks-and-assumptions.md
- testing-playbook.md
- release-checklist.md
- journey-log.md
- daily/ (timestamped execution notes)

## Update Rules
- Update scope-v1.md whenever feature scope changes.
- Update contract-spec.md for every contract-level rule change.
- Update frontend-spec.md for every route or UX behavior change.
- Append journey-log.md at every significant milestone.
- Add one daily note in daily/ for each implementation session.

## Current Build Target
- Chain: Monad testnet
- V1: Create market, code lookup, place bet, creator resolve, winner claim, fee routing
- Wallet: MetaMask only
- Contracts: Hardhat
- Frontend: Next.js app named openmarketz-frontend
- Frontend local URL: http://localhost:3069
- Current testnet contract: 0xeD5A4f0A0bF5dF8a19Fa7a9793334949dFDE45F4
