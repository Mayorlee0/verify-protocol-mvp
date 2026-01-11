# Database Model (Prisma/Postgres)

## manufacturers
- id (uuid pk)
- name (string)
- status (active/suspended)
- hmac_kms_key_id (string)  // reference to KMS key; no plaintext secret
- created_at (timestamp)

## skus
- id (uuid pk)
- manufacturer_id (fk manufacturers)
- sku_code (string)
- sku_name (string)
- sku_hash (bytes32)
- created_at

## batches
- id (uuid pk)
- manufacturer_id (fk)
- sku_id (fk)
- batch_public_id (string unique)  // encoded in QR payload
- batch_label (string)
- expiry_date (date nullable)
- reward_usd_target (numeric default 0.10)
- onchain_batch_pubkey (string nullable)
- status (CREATED/ACTIVE/PAUSED/CLOSED)
- activated_at (timestamp nullable)
- activated_tx_signature (string nullable)
- created_at

## code_packs
- id (uuid pk)
- pack_id (string unique)
- batch_id (fk)
- quantity (int)
- status (GENERATING/READY/DOWNLOADED/PRINT_CONFIRMED)
- download_count (int default 0)
- download_expires_at (timestamp nullable)
- downloaded_at (timestamp nullable)
- print_confirmed_at (timestamp nullable)
- plaintext_purged_at (timestamp nullable)
- created_at

## codes (MVP table; plaintext must be purgeable)
- id (uuid pk)
- pack_id (fk)
- code_plaintext (string nullable) // encrypted-at-rest; purged later
- qr_payload (string)
- commitment (bytes32)
- onchain_code_pda (string)
- created_at

## users
- id (uuid pk)
- email (string unique)
- privy_user_id (string unique nullable)
- created_at

## user_wallets
- id (uuid pk)
- user_id (fk)
- chain (string default "solana")
- wallet_pubkey (string unique)
- created_at
- created_after_first_success (bool default true)

## verify_intents
- id (uuid pk)
- verify_intent_id (string unique)
- batch_id (fk)
- commitment (bytes32)
- reward_lamports (bigint)
- status (ISSUED/CONFIRMED/EXPIRED/FAILED)
- expires_at (timestamp)
- created_at

## verifications
- id (uuid pk)
- batch_id (fk)
- user_id (fk)
- commitment (bytes32)
- code_pda (string)
- reward_lamports (bigint)
- tx_signature (string)
- verified_at (timestamp)
- result (SUCCESS/FAIL)
- failure_reason (string nullable)

## treasury_ops
- id (uuid pk)
- type (REFILL_SWAP)
- pyusd_in (bigint)
- sol_out_lamports (bigint)
- jupiter_route (jsonb)
- tx_signature (string)
- created_at

Notes:
- Plaintext codes MUST be purged after PRINT_CONFIRMED.
- Do not store OTPs in DB unless required; prefer provider-managed OTP.
