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

## Repo structure
- /api      Fastify API (TypeScript)
- /db       Prisma schema + migrations
- /programs authenticity_protocol Anchor program
- /worker   Treasury refill worker (TypeScript)
- /docs     Specs and MVP plan

## Development (local)
### 1) Start Postgres
```bash
createdb verify_protocol_mvp
```

### 2) Configure env vars
```bash
export DATABASE_URL="postgresql://localhost:5432/verify_protocol_mvp"
export ENCRYPTION_KEY="$(openssl rand -base64 32)" # or 64-char hex
export MANUFACTURER_SECRET="replace-with-strong-secret"
export DEFAULT_REWARD_LAMPORTS="100000"
export CODE_INTENT_TTL_SECONDS="120"
export MANUFACTURER_API_KEY="replace-with-api-key"
export JWT_SECRET="replace-with-strong-jwt-secret"
export PRIVY_APP_ID="replace-with-privy-app-id"
export PRIVY_APP_SECRET="replace-with-privy-app-secret"
export SPONSOR_WALLET_PUBKEY="replace-with-sponsor-wallet-pubkey"
```

### 3) Run Prisma migrate
```bash
cd db
npm install
npx prisma migrate dev --name init
```

### 4) Run API
```bash
cd api
npm install
npm run dev
```

### 5) Build Anchor program (localnet)
```bash
cd programs/authenticity_protocol
anchor build
```

### 6) Run treasury refill worker
```bash
cd worker
npm install
npm run dev
```

See /docs for full specs.
