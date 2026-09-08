-- 002_wallet_integrity.sql — backfill financial columns on pre-existing databases.
--
-- RULES (sec 17/28/29):
--   * Integer paise only; balances keep CHECK (>= 0) invariants.
--   * Idempotent: guarded renames + ADD COLUMN IF NOT EXISTS.
--   * NEVER drops a column/table and NEVER deletes ledger rows.

-- Legacy ledger columns were once named before_balance/after_balance. Rename them
-- to the canonical balance_before/balance_after only when the old names exist.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wallet_ledger' AND column_name='before_balance') THEN
        ALTER TABLE wallet_ledger RENAME COLUMN before_balance TO balance_before;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wallet_ledger' AND column_name='after_balance') THEN
        ALTER TABLE wallet_ledger RENAME COLUMN after_balance TO balance_after;
    END IF;
END $$;

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS available_balance BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS deposit_balance BIGINT NOT NULL DEFAULT 0 CHECK (deposit_balance >= 0);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS winnings_balance BIGINT NOT NULL DEFAULT 0 CHECK (winnings_balance >= 0);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS rewards_balance BIGINT NOT NULL DEFAULT 0 CHECK (rewards_balance >= 0);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_balance BIGINT NOT NULL DEFAULT 0 CHECK (locked_balance >= 0);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS balance_before BIGINT NOT NULL DEFAULT 0;
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS balance_after BIGINT NOT NULL DEFAULT 0;
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'CREDIT';
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50) DEFAULT 'DEPOSIT';
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'COMPLETED';
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

ALTER TABLE deposits ADD COLUMN IF NOT EXISTS deposit_id VARCHAR(64);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS utr VARCHAR(100);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS admin_id VARCHAR(64);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS withdrawal_id VARCHAR(64);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_method VARCHAR(50) DEFAULT 'UPI';
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_address_or_upi VARCHAR(256) DEFAULT '';
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS upi_id VARCHAR(256) DEFAULT '';
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processing_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS admin_id VARCHAR(64);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
