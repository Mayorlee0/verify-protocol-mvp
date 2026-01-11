# On-chain Program Spec (Anchor)

Program name: authenticity_protocol

## Accounts (PDAs)

### Manufacturer (PDA)
Seeds: ["manufacturer", manufacturer_authority_pubkey]
Fields:
- authority: Pubkey
- status: u8 (ACTIVE=1, SUSPENDED=2)
- created_at: i64

### Batch (PDA)
Seeds: ["batch", manufacturer_pda, batch_public_id_bytes]
Fields:
- manufacturer: Pubkey (manufacturer_pda)
- sku_hash: [u8; 32]
- batch_public_id: [u8; N] or stored string bytes
- expiry_ts: i64 (optional, 0 if none)
- reward_usd_target: u64 (e.g. 10 cents in micros; for record only)
- status: u8 (CREATED=0, ACTIVE=1, PAUSED=2, CLOSED=3)
- activated_at: i64 (optional)
- created_at: i64

### CodeState (PDA)
Seeds: ["code", batch_pda, commitment_32]
Fields:
- batch: Pubkey
- commitment: [u8; 32]
- status: u8 (UNUSED=0, USED=1, EXPIRED=2, REVOKED=3)
- verified_by: Pubkey (default Pubkey::default)
- verified_at: i64 (0 if never)

### Treasury (PDA) (protocol-level)
Seeds: ["treasury"]
Fields:
- sol_payout_vault: Pubkey  // system account address controlled by program or a PDA-owned account
- min_sol_buffer_lamports: u64
- created_at: i64
Notes:
- For MVP, protocol keeps SOL payout vault funded via off-chain worker.

## Instructions

### activate_batch()
Accounts:
- manufacturer_pda (read)
- batch_pda (write)
- manufacturer_authority (signer)
Checks:
- manufacturer_pda.status == ACTIVE
- manufacturer_authority == manufacturer_pda.authority
- batch_pda.status == CREATED (or PAUSED if you allow re-activate)
Effects:
- batch_pda.status = ACTIVE
- batch_pda.activated_at = now
Emit event:
- BatchActivated { batch: Pubkey, manufacturer: Pubkey, ts: i64 }

### verify_and_pay_sol(commitment: [u8;32], reward_lamports: u64)
Accounts:
- manufacturer_pda (read)
- batch_pda (read)
- code_state_pda (write)  // derived using commitment
- treasury_pda (read)
- sol_payout_vault (write) // holds SOL float
- user_destination (write) // recipient system account (embedded wallet pubkey)
- system_program
Optional:
- user_stats_pda (write) // for throttling later

Checks:
- manufacturer_pda.status == ACTIVE
- batch_pda.status == ACTIVE
- If batch expiry used: now <= batch_pda.expiry_ts
- code_state_pda.status == UNUSED
- sol_payout_vault has >= reward_lamports
- (Optional) user_stats throttling

Effects (atomic in one tx):
- code_state_pda.status = USED
- code_state_pda.verified_by = user_destination
- code_state_pda.verified_at = now
- Transfer reward_lamports from sol_payout_vault to user_destination via system_program transfer
Emit event:
- Verified { batch: Pubkey, commitment: [u8;32], user: Pubkey, lamports: u64, ts: i64 }

Notes:
- User does not need to sign verification (recipient-only).
- Fee payer will be sponsor wallet (off-chain relayer).

## Error codes (suggested)
- ManufacturerSuspended
- BatchNotActive
- BatchExpired
- CodeNotUnused
- InsufficientTreasury
- InvalidAccounts
