use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("AuthP1nDUMMY111111111111111111111111111111");

const STATUS_ACTIVE: u8 = 1;
const STATUS_CREATED: u8 = 0;
const STATUS_PAUSED: u8 = 2;

const CODE_UNUSED: u8 = 0;
const CODE_USED: u8 = 1;

#[program]
pub mod authenticity_protocol {
    use super::*;

    pub fn initialize_manufacturer(ctx: Context<InitializeManufacturer>, status: u8) -> Result<()> {
        let manufacturer = &mut ctx.accounts.manufacturer_pda;
        manufacturer.authority = ctx.accounts.manufacturer_authority.key();
        manufacturer.status = status;
        manufacturer.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn initialize_batch(
        ctx: Context<InitializeBatch>,
        batch_public_id: Vec<u8>,
        sku_hash: [u8; 32],
        reward_usd_target: u64,
        expiry_ts: i64,
    ) -> Result<()> {
        let batch = &mut ctx.accounts.batch_pda;
        batch.manufacturer = ctx.accounts.manufacturer_pda.key();
        batch.sku_hash = sku_hash;
        batch.batch_public_id = batch_public_id;
        batch.expiry_ts = expiry_ts;
        batch.reward_usd_target = reward_usd_target;
        batch.status = STATUS_CREATED;
        batch.activated_at = 0;
        batch.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn initialize_code_state(
        ctx: Context<InitializeCodeState>,
        commitment: [u8; 32],
    ) -> Result<()> {
        let code_state = &mut ctx.accounts.code_state_pda;
        code_state.batch = ctx.accounts.batch_pda.key();
        code_state.commitment = commitment;
        code_state.status = CODE_UNUSED;
        code_state.verified_by = Pubkey::default();
        code_state.verified_at = 0;
        Ok(())
    }

    pub fn initialize_treasury(
        ctx: Context<InitializeTreasury>,
        sol_payout_vault: Pubkey,
        min_sol_buffer_lamports: u64,
    ) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury_pda;
        treasury.sol_payout_vault = sol_payout_vault;
        treasury.min_sol_buffer_lamports = min_sol_buffer_lamports;
        treasury.created_at = Clock::get()?.unix_timestamp;
        treasury.bump = *ctx.bumps.get("treasury_pda").ok_or(ErrorCode::InvalidAccounts)?;
        Ok(())
    }

    pub fn activate_batch(ctx: Context<ActivateBatch>) -> Result<()> {
        let manufacturer = &ctx.accounts.manufacturer_pda;
        let batch = &mut ctx.accounts.batch_pda;

        require!(manufacturer.status == STATUS_ACTIVE, ErrorCode::ManufacturerSuspended);
        require!(
            batch.status == STATUS_CREATED || batch.status == STATUS_PAUSED,
            ErrorCode::BatchNotActive
        );

        batch.status = STATUS_ACTIVE;
        batch.activated_at = Clock::get()?.unix_timestamp;

        emit!(BatchActivated {
            batch: batch.key(),
            manufacturer: manufacturer.key(),
            ts: batch.activated_at
        });

        Ok(())
    }

    pub fn verify_and_pay_sol(
        ctx: Context<VerifyAndPaySol>,
        _commitment: [u8; 32],
        reward_lamports: u64,
    ) -> Result<()> {
        let manufacturer = &ctx.accounts.manufacturer_pda;
        let batch = &ctx.accounts.batch_pda;
        let code_state = &mut ctx.accounts.code_state_pda;
        let treasury = &ctx.accounts.treasury_pda;

        require!(manufacturer.status == STATUS_ACTIVE, ErrorCode::ManufacturerSuspended);
        require!(batch.status == STATUS_ACTIVE, ErrorCode::BatchNotActive);
        if batch.expiry_ts > 0 {
            require!(Clock::get()?.unix_timestamp <= batch.expiry_ts, ErrorCode::BatchExpired);
        }
        require!(code_state.status == CODE_UNUSED, ErrorCode::CodeNotUnused);
        require!(reward_lamports > 0, ErrorCode::InvalidReward);

        let vault_lamports = ctx.accounts.sol_payout_vault.to_account_info().lamports();
        require!(vault_lamports >= reward_lamports, ErrorCode::InsufficientTreasury);
        require!(treasury.sol_payout_vault == ctx.accounts.sol_payout_vault.key(), ErrorCode::InvalidAccounts);

        code_state.status = CODE_USED;
        code_state.verified_by = ctx.accounts.user_destination.key();
        code_state.verified_at = Clock::get()?.unix_timestamp;

        let treasury_seeds: &[&[u8]] = &[b"treasury", &[treasury.bump]];
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.sol_payout_vault.to_account_info(),
                to: ctx.accounts.user_destination.to_account_info(),
            },
            &[treasury_seeds],
        );
        system_program::transfer(transfer_ctx, reward_lamports)?;

        emit!(Verified {
            batch: batch.key(),
            commitment: code_state.commitment,
            user: ctx.accounts.user_destination.key(),
            lamports: reward_lamports,
            ts: code_state.verified_at
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeManufacturer<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [b"manufacturer", manufacturer_authority.key().as_ref()],
        bump,
        space = 8 + 32 + 1 + 8
    )]
    pub manufacturer_pda: Account<'info, Manufacturer>,
    pub manufacturer_authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeBatch<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [b"batch", manufacturer_pda.key().as_ref(), batch_public_id.as_slice()],
        bump,
        space = 8 + 32 + 32 + 4 + 64 + 8 + 8 + 1 + 8 + 8
    )]
    pub batch_pda: Account<'info, Batch>,
    pub manufacturer_pda: Account<'info, Manufacturer>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeCodeState<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [b"code", batch_pda.key().as_ref(), commitment.as_ref()],
        bump,
        space = 8 + 32 + 32 + 1 + 32 + 8
    )]
    pub code_state_pda: Account<'info, CodeState>,
    pub batch_pda: Account<'info, Batch>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [b"treasury"],
        bump,
        space = 8 + 32 + 8 + 8 + 1
    )]
    pub treasury_pda: Account<'info, Treasury>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ActivateBatch<'info> {
    pub manufacturer_pda: Account<'info, Manufacturer>,
    #[account(mut)]
    pub batch_pda: Account<'info, Batch>,
    pub manufacturer_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct VerifyAndPaySol<'info> {
    pub manufacturer_pda: Account<'info, Manufacturer>,
    pub batch_pda: Account<'info, Batch>,
    #[account(mut)]
    pub code_state_pda: Account<'info, CodeState>,
    pub treasury_pda: Account<'info, Treasury>,
    #[account(mut)]
    pub sol_payout_vault: AccountInfo<'info>,
    #[account(mut)]
    pub user_destination: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Manufacturer {
    pub authority: Pubkey,
    pub status: u8,
    pub created_at: i64,
}

#[account]
pub struct Batch {
    pub manufacturer: Pubkey,
    pub sku_hash: [u8; 32],
    pub batch_public_id: Vec<u8>,
    pub expiry_ts: i64,
    pub reward_usd_target: u64,
    pub status: u8,
    pub activated_at: i64,
    pub created_at: i64,
}

#[account]
pub struct CodeState {
    pub batch: Pubkey,
    pub commitment: [u8; 32],
    pub status: u8,
    pub verified_by: Pubkey,
    pub verified_at: i64,
}

#[account]
pub struct Treasury {
    pub sol_payout_vault: Pubkey,
    pub min_sol_buffer_lamports: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[event]
pub struct BatchActivated {
    pub batch: Pubkey,
    pub manufacturer: Pubkey,
    pub ts: i64,
}

#[event]
pub struct Verified {
    pub batch: Pubkey,
    pub commitment: [u8; 32],
    pub user: Pubkey,
    pub lamports: u64,
    pub ts: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Manufacturer suspended")]
    ManufacturerSuspended,
    #[msg("Batch not active")]
    BatchNotActive,
    #[msg("Batch expired")]
    BatchExpired,
    #[msg("Code not unused")]
    CodeNotUnused,
    #[msg("Insufficient treasury")]
    InsufficientTreasury,
    #[msg("Invalid accounts")]
    InvalidAccounts,
    #[msg("Invalid reward")]
    InvalidReward,
}
