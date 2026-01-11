# Verify Protocol MVP (Anti-Counterfeit + Rewards)

This repo contains the MVP for a blockchain-backed authenticity verification system for pharma/skincare.

## Core idea
- Manufacturers request code packs
- Protocol generates plaintext scratch codes for printing (QR + manual fallback)
- For each code, protocol computes a commitment using manufacturer-owned secret (HMAC)
- Only commitments are anchored on Solana (plaintext never on-chain)
- Manufacturer confirms printing, then activates the batch when product ships
- Consumers verify codes on manufacturer website:
  - If valid + unused + batch ACTIVE => mark USED and pay reward in SOL
  - Privy embedded wallet is created ONLY after first successful verification
  - Transactions are gasless; fee payer is sponsor wallet
- Manufacturers prefund in PYUSD; protocol maintains SOL payout float and refills via batched swaps using Jupiter

## Repo structure (planned)
- /api      Fastify API (TypeScript)
- /db       Prisma schema + migrations
- /programs authenticity_protocol Anchor program
- /worker   Treasury refill worker (Jupiter swap)

## Development (high-level)
1) Start Postgres
2) Configure env vars
3) Run Prisma migrate
4) Run API
5) Deploy Anchor program to devnet
6) Run worker for treasury refill

See /docs for full specs.
