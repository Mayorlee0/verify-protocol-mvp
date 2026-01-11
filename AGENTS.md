# Agent instructions (Codex)

## Project goal
Build MVP for an anti-counterfeit verification protocol:
- Manufacturer-owned secret + protocol-issued code packs
  - Plaintext codes are exported for printing then purged
  - On-chain stores commitments only (never plaintext codes)
- Batch must be ACTIVATED before verification payouts (prevents early leakage abuse)
- Consumer uses email login; Privy embedded wallet is created ONLY after first successful verification
- Verification + withdrawal are GASLESS (fee payer is sponsor wallet)
- Rewards are paid in SOL from a protocol SOL payout float
- Manufacturers prefund in PYUSD; treasury refills SOL float via batched PYUSD->SOL swaps using Jupiter
- QR + manual fallback
  - QR payload is NOT a URL; it encodes `VFY1|<batch_public_id>|<code>`

## Tech choices (MVP)
- API: Node.js + Fastify (TypeScript)
- DB: Postgres + Prisma
- On-chain: Solana Anchor program (Rust)
- Worker: Node worker/cron (TypeScript) for treasury refill

## Security requirements
- NEVER store manufacturer secrets in plaintext; assume KMS/HSM. Store only KMS key identifiers.
- Plaintext codes must be encrypted at rest and purged after manufacturer confirms printing.
- Do not log plaintext codes, OTPs, or full emails in app logs. Mask or hash where necessary.
- Rate limit verification endpoints and support CAPTCHA token parameter.
- Verify intent must be short-lived and revalidated to prevent race/replay.

## Output expectations
- Create small, reviewable PRs
- Add README with setup and run commands
- Add basic tests where feasible (API unit tests; minimal Anchor tests)
- Use environment variables for secrets and config
