# OpenMarketz

> Permissionless prediction markets where the creator is the oracle.

---

## The Problem

Prediction markets today are bottlenecked by curation. Polymarket, Kalshi, and every major platform decide what markets exist. That means thousands of real, meaningful events never get a market — too niche, too local, too community-specific.

At the same time, friend groups and online communities make bold claims every day with no trustless way to settle them. Bets are broken, money goes unpaid, and disputes are settled by memory and screenshots.

**OpenMarketz fixes both.**

---

## What Is OpenMarketz

OpenMarketz is a fully permissionless prediction market protocol built on Monad. Anyone can create a market on any event in under 30 seconds. The creator is the oracle — they resolve the market when the event concludes.

No listing process. No gatekeepers. No permission needed.

---

## How It Works

1. **Create** — Anyone creates a market on any event. Takes 30 seconds.
2. **Share** — Every market gets a unique code: `OPEN<10-digit-id>`. Share it anywhere — Twitter, Telegram, Instagram, group chats.
3. **Bet** — Anyone who sees the code can place a bet in MON (Monad's native token).
4. **Resolve** — When the event concludes, the creator resolves the market as YES or NO.
5. **Payout** — Smart contract automatically distributes winnings. OpenMarketz takes a small protocol fee.

---

## The Oracle Model

The creator is the oracle. This is a deliberate design decision.

**Why it works:**
- If a creator lies, their on-chain resolution history is public forever
- Sharing `OPEN<code>` on Twitter stakes your public reputation on honest resolution
- Nobody invests in markets from creators they don't trust — same social logic as any community
- Fully permissionless — the market self-moderates through reputation, not rules

This is not a bug. It is the security model.

---

## Why Monad

- EVM-compatible — familiar tooling and composability
- High throughput and low fees — essential for micro-betting use cases
- Early ecosystem — grants, visibility, and community tailwind for builders
- Fast finality — critical for real-time market resolution

---

## What Makes This Different

| | Polymarket | OpenMarketz |
|---|---|---|
| Market creation | Curated by team | Permissionless |
| Oracle | Decentralized UMA | Creator |
| Events covered | Global liquid markets | Everything else |
| Listing speed | Days to weeks | 30 seconds |
| Trust model | Trust the protocol | Trust the creator |
| Target user | Traders | Communities |

OpenMarketz is not competing with Polymarket. It is the long tail they will never serve.

---

## Use Cases

- **Friend groups** — "Bet I finish this project by Friday"
- **Crypto communities** — "Will ETH hit $5k before Q3?"
- **Niche events** — "Will YC open a branch in India before 2027?"
- **DAOs** — "Will this governance proposal pass?"
- **Sports** — Local leagues, niche matchups, events no platform covers
- **Creator communities** — "Will this indie hacker hit $10k MRR?"

---

## Business Model

- **Transaction fee** on every bet placed
- **Resolution fee** on winning payouts
- Protocol-owned, open source, sustainable from volume

---

## Open Source

OpenMarketz is fully open source. The protocol is public. The code is verifiable. Anyone can fork it, audit it, or build on top of it.

Transparency is not optional in a trust-based oracle model. The open source nature is a feature, not a liability.

---

## Roadmap

**V1 — Core Protocol**
- Smart contract deployment on Monad testnet
- Market creation and betting interface
- Unique `OPEN<code>` generation and sharing
- Creator resolution mechanism
- Automatic payout on resolution

**V2 — Social Layer**
- Creator reputation scores based on resolution history
- Predictor leaderboards within communities
- Market history tied to Twitter/social identity
- Shareable market cards for Twitter/Telegram

**V3 — Ecosystem**
- Monad mainnet deployment
- API for third party integrations
- Telegram bot for in-chat market creation and betting
- Grant applications and ecosystem partnerships

---

## The Vision

Every bold claim on the internet is a potential market. Every community has events worth betting on. Every creator has an audience that trusts them.

OpenMarketz makes all of that possible without asking anyone's permission.

---

## Builder

Built by a 19 year old CSE student and web3 developer with 1600+ GitHub commits. Personally felt this problem. Building in public on Monad.

---

*Bet responsibly. Trust your oracle.*