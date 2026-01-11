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
export DEMO_MODE="false"
export CORS_ORIGINS="http://localhost:3001"
export NEXT_PUBLIC_API_BASE_URL="http://localhost:3000"
export DEMO_MFG_PASSWORD="demo-password"
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

### 5) Run web demo
```bash
cd web
npm install
npm run dev
```

If you see npm 403 errors, run:
```bash
npm config set registry https://registry.npmjs.org/
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### 6) Build Anchor program (localnet)
```bash
cd programs/authenticity_protocol
anchor build
```

### 7) Devnet smoke test (verify flow)
```bash
cd api
export AUTHENTICITY_PROGRAM_ID="replace-with-program-id"
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export SPONSOR_WALLET_KEYPAIR='[1,2,3]'
export MANUFACTURER_AUTHORITY_KEYPAIR='[4,5,6]'
export SOL_PAYOUT_VAULT_KEYPAIR='[7,8,9]'
export MANUFACTURER_SECRET="replace-with-strong-secret"
export API_BASE_URL="http://localhost:3000"
npm run smoke:devnet
```

### 8) Run treasury refill worker
```bash
cd worker
npm install
npm run dev
```

## Deployment (Render/Railway + Neon)
1) Provision Postgres on Neon and copy the connection string.
2) Deploy the API service to Render or Railway with environment variables from `.env.example`.
3) Set `DATABASE_URL` to the Neon connection string and run Prisma migrations:
   ```bash
   cd db
   npm install
   npx prisma migrate deploy
   ```
4) Configure `DEMO_MODE=true` for demo environments or `false` for real on-chain verification.
5) Ensure `SPONSOR_WALLET_KEYPAIR`, `AUTHENTICITY_PROGRAM_ID`, and Solana account PDAs are set for on-chain verification.

See /docs for full specs.
