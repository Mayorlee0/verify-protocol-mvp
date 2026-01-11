# MVP Plan (Codex implementation roadmap)

## Milestone 0: Repo scaffold
- Fastify app skeleton
- Prisma schema + migration
- Anchor program skeleton
- Worker skeleton
- Env config + README

## Milestone 1: Manufacturer flows (off-chain)
- Manufacturer auth (simple JWT)
- Create SKU + Batch + Code Pack request
- Generate codes (CSPRNG), QR payload, checksum
- Compute commitments using KMS placeholder function
- Persist pack + codes in DB (plaintext encrypted)
- Export CSV + signed download link
- Confirm printed -> purge plaintext

## Milestone 2: On-chain commitment anchoring
- Deploy Anchor program to devnet
- Create Manufacturer PDA + Batch PDA
- Add Codes: create CodeState PDAs in chunks
- Implement activate_batch
- Implement verify_and_pay_sol
- Add events

## Milestone 3: Consumer verify flow (Privy)
- /auth/start, /auth/verify using Privy (email OTP)
- /verify/quote:
  - compute commitment
  - fetch CodeState + Batch status (must be ACTIVE)
  - compute lamports for ~$0.10 via quote service placeholder
  - create verify_intent
- /verify/confirm:
  - revalidate code still UNUSED
  - create embedded wallet only on success (Privy)
  - relayer submits verify_and_pay_sol (fee payer sponsor wallet)
  - record verification

## Milestone 4: Treasury float + refill
- Protocol SOL payout vault + monitoring
- PYUSD prefund accounting in DB (MVP)
- Worker calls Jupiter quote+swap and refills SOL vault
- Handle low float: return PENDING to verify/confirm

## Milestone 5: Hardening
- Rate limiting + CAPTCHA param enforcement
- Basic abuse analytics
- Tests: API unit tests + Anchor tests
- Logging redaction
