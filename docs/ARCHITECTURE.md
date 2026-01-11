# Architecture

## Problem
Counterfeit pharmaceuticals/skincare cause severe health risks. Existing scratch/SMS verification suffers from replay, cloning, and centralized trust issues.

## Solution overview
A hybrid web2 + Solana protocol:
- Scratch code is entered on a manufacturer’s website (QR scan + manual fallback).
- Code validity is verified against on-chain commitment state (UNUSED/USED), without exposing code data.
- Consumers are incentivized with small cashback rewards to encourage verification adoption.

## Key design choices
- On-chain: commitments + state only (no plaintext codes).
- Privacy: reverse engineering prevented by keyed commitments (HMAC with manufacturer-owned secret).
- Activation control: batches must be ACTIVATED after printing/shipping.
- UX: Privy embedded wallets; no private keys shown to users.
- Gasless: protocol pays fees (fee payer wallet).
- Rewards: pay SOL to users; manufacturers prefund PYUSD; protocol uses treasury float + batched swaps.

## Actors
- Manufacturer: requests code packs, prints scratch labels, activates batches.
- Consumer: verifies code on manufacturer site; receives SOL reward.
- Protocol backend: generates codes, computes commitments, runs relayer, runs treasury refill worker.
- Solana program: enforces single-use verification, activation gating, and payout transfer from SOL vault.
- Treasury worker: swaps PYUSD -> SOL in batches to refill payout.

## Data & cryptography
### Code format
- Human-friendly Base32-like (no ambiguous chars), grouped with hyphens, plus checksum.
- Example: `B7K9-2QFJ-8MZT-X3P6-C`

### QR payload (not a URL)
- `VFY1|<batch_public_id>|<code>`
- Version marker allows future changes without breaking scanners.

### Commitment
- `commitment = HMAC-SHA256(manufacturer_secret, code || batch_id || sku_hash)`
- On-chain stores only `commitment` and its status.

## Core flows
### 1) Manufacturer onboarding
- Manufacturer is verified in admin process.
- Manufacturer secret is stored in KMS/HSM (backend can compute HMAC; humans cannot read secret).

### 2) Code pack generation
- Manufacturer requests N codes for SKU+batch.
- Protocol generates N codes (CSPRNG), computes commitments via manufacturer secret, and writes commitments on-chain (CodeState PDAs).
- Protocol exports plaintext codes + QR payload to manufacturer for printing.
- After manufacturer confirms printing, protocol purges plaintext codes.

### 3) Activate batch
- Manufacturer clicks “Activate batch” after shipping/release.
- On-chain batch status changes from CREATED -> ACTIVE.

### 4) Consumer verification + reward (gasless)
- Consumer enters/scans code and logs in with email.
- Backend computes commitment and checks CodeState is UNUSED.
- If eligible, backend creates a short-lived verify intent.
- On confirm:
  - If user does not yet have embedded wallet, create it now (Privy).
  - Relayer submits on-chain `verify_and_pay_sol` with fee payer = sponsor wallet.
  - Program marks code USED and transfers SOL from payout vault to user wallet.

### 5) Treasury float + batched swaps
- Manufacturers prefund PYUSD to protocol treasury.
- Protocol keeps SOL payout float.
- When SOL float low, worker runs a batched Jupiter swap PYUSD->SOL to refill.

## Threat model (MVP)
- Counterfeiters copying codes: stopped by single-use state on-chain.
- Blockchain scanning: no plaintext codes, commitments are HMAC keyed.
- Replay attacks: code flips to USED atomically.
- Early leakage: batch must be ACTIVE to pay.
- Bot farming: CAPTCHA + rate limits + optional per-wallet daily limits.

## Non-goals (MVP)
- Naming services (.sol / custom TLD)
- Fully decentralized manufacturer self-signing (can be added later)
- ZK circuits for code proofs (future work)
