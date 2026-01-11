# API Spec (Fastify)

Base URL: /api (suggested)

## Auth (Email OTP)
### POST /auth/start
Starts an email OTP flow.

Request:
{
  "email": "user@example.com"
}

Response:
{
  "status": "OTP_SENT",
  "request_id": "req_123"
}

### POST /auth/verify
Verifies OTP and returns a session token.

Request:
{
  "request_id": "req_123",
  "email": "user@example.com",
  "otp": "123456"
}

Response:
{
  "status": "AUTHENTICATED",
  "session_token": "jwt_or_session",
  "user_id": "usr_abc",
  "has_embedded_wallet": false
}

Notes:
- has_embedded_wallet remains false until first successful verification.

## Public verification (Manufacturer website)
QR format: `VFY1|<batch_public_id>|<code>`

### POST /verify/quote
Validates whether code is eligible and returns a short-lived verify intent.
Does NOT create wallet.

Request:
{
  "batch_public_id": "BATCH_9H3K2",
  "code": "B7K9-2QFJ-8MZT-X3P6-C",
  "client": {
    "captcha_token": "optional",
    "user_agent": "optional",
    "ip": "optional"
  }
}

Response (eligible):
{
  "status": "ELIGIBLE",
  "verify_intent_id": "vfyint_456",
  "reward": {
    "usd_target": "0.10",
    "lamports": 1234567,
    "pricing_source": "jupiter_quote",
    "expires_at": "2026-01-11T18:40:00Z"
  }
}

Response (not eligible):
{
  "status": "NOT_ELIGIBLE",
  "reason": "BATCH_NOT_ACTIVE | CODE_NOT_FOUND | CODE_USED | CODE_REVOKED | CODE_EXPIRED | RATE_LIMITED"
}

### POST /verify/confirm
Requires Authorization Bearer session token.
Finalizes verification atomically on-chain and pays SOL to embedded wallet.
Creates embedded wallet ONLY if this is the first successful verification.

Headers:
Authorization: Bearer <session_token>

Request:
{
  "verify_intent_id": "vfyint_456"
}

Response (verified):
{
  "status": "VERIFIED",
  "tx_signature": "5G...abc",
  "payout": {
    "lamports": 1234567,
    "wallet_pubkey": "SoL4nA....User"
  },
  "code_state": "USED"
}

Response (treasury low):
{
  "status": "PENDING",
  "reason": "TREASURY_REFILL_IN_PROGRESS",
  "estimated_retry_seconds": 60
}

## User endpoints
### GET /me
Returns profile and wallet info.

Response:
{
  "user_id": "usr_abc",
  "email": "user@example.com",
  "embedded_wallet": {
    "created": true,
    "pubkey": "SoL4nA....User"
  },
  "rewards": {
    "lifetime_lamports": 9876543
  }
}

### POST /withdraw/request
Gasless withdrawal to external address.

Headers:
Authorization: Bearer <session_token>

Request:
{
  "destination_pubkey": "PhanTom....Dest",
  "lamports": 3000000
}

Response:
{
  "status": "WITHDRAW_SUBMITTED",
  "tx_signature": "4H...xyz"
}

## Manufacturer dashboard endpoints
Auth model: standard web auth/JWT (manufacturer admin), not consumer OTP.

### POST /mfg/batches
Create batch + request code pack generation.

Request:
{
  "sku_code": "SKINCREAM_50ML",
  "batch_label": "JAN2026-A",
  "expiry_date": "2027-01-01",
  "quantity": 50000
}

Response:
{
  "batch_public_id": "BATCH_9H3K2",
  "status": "CREATED",
  "pack_id": "PACK_001",
  "pack_status": "GENERATING"
}

### GET /mfg/packs/{pack_id}
Response:
{
  "pack_id": "PACK_001",
  "batch_public_id": "BATCH_9H3K2",
  "status": "READY",
  "download_url": "signed_url",
  "expires_at": "2026-01-12T00:00:00Z"
}

### POST /mfg/packs/{pack_id}/confirm-printed
Marks printing complete and triggers plaintext purge.

Response:
{
  "status": "PRINT_CONFIRMED",
  "plaintext_purged": true
}

### POST /mfg/batches/{batch_public_id}/activate
Activates batch on-chain (CREATED -> ACTIVE). Should require print confirmed.

Request:
{
  "activate_at": "2026-01-11T18:55:00Z"
}

Response:
{
  "status": "ACTIVE",
  "tx_signature": "3K...def"
}

## Internal treasury endpoints (optional, can be cron-only)
### POST /internal/treasury/refill
Triggers batched Jupiter swap PYUSD->SOL and refills SOL payout vault.
