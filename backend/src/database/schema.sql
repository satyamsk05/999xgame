-- PostgreSQL Schema DDL Script for InGames / 999x Game Platform
-- Money amounts are stored as INTEGER (paise), e.g. ₹10.00 = 1000 paise
--
-- NOTE (sec 29): this file is the CANONICAL CONSOLIDATED schema reference and is
-- validated by tests/schema.test.js. At runtime the database is provisioned by the
-- ordered, idempotent migrations in ./migrations (001_initial .. 005_indexes) via
-- migrate.js, which collectively produce exactly this schema. Keep the two in sync:
-- any new column/index/constraint must be added as a NEW migration file, never by
-- editing an already-applied one.

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    phone VARCHAR(20) UNIQUE,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE,
    avatar_path VARCHAR(255) DEFAULT 'assets/avatar/avatar_1.png',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    available_balance BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
    reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
    deposit_balance BIGINT NOT NULL DEFAULT 0 CHECK (deposit_balance >= 0),
    winnings_balance BIGINT NOT NULL DEFAULT 0 CHECK (winnings_balance >= 0),
    rewards_balance BIGINT NOT NULL DEFAULT 0 CHECK (rewards_balance >= 0),
    locked_balance BIGINT NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_id VARCHAR(64) NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL, -- DEPOSIT, CREDIT, DEBIT, WITHDRAW_RESERVE, WITHDRAW_FINALIZE, WITHDRAW_RELEASE, BET_DEBIT, WIN_CREDIT
    amount BIGINT NOT NULL CHECK (amount > 0),
    direction VARCHAR(10) NOT NULL DEFAULT 'CREDIT' CHECK (direction IN ('CREDIT', 'DEBIT')),
    reference_type VARCHAR(50) NOT NULL DEFAULT 'DEPOSIT', -- DEPOSIT, WITHDRAWAL, GAME_BET, GAME_WIN, BONUS
    reference_id VARCHAR(100),
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    idempotency_key VARCHAR(100) UNIQUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'COMING_SOON', -- LIVE, COMING_SOON, DISABLED
    entry_fee BIGINT NOT NULL DEFAULT 1000,
    min_stake BIGINT NOT NULL DEFAULT 1000,
    max_stake BIGINT NOT NULL DEFAULT 100000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_rounds (
    id VARCHAR(64) PRIMARY KEY,
    game_id VARCHAR(50) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round_number BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED', -- CREATED, BETTING_OPEN, BETTING_CLOSED, ROLLING, RESULT, SETTLING, SETTLED
    server_seed VARCHAR(128) NOT NULL,
    client_seed VARCHAR(128),
    result JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    betting_closed_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_game_round_number UNIQUE(game_id, round_number)
);

CREATE TABLE IF NOT EXISTS bets (
    id VARCHAR(64) PRIMARY KEY,
    round_id VARCHAR(64) NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bet_type VARCHAR(50) NOT NULL, -- DOWN (2-6), SEVEN (7), UP (8-12)
    stake BIGINT NOT NULL CHECK (stake > 0),
    payout_multiplier NUMERIC(5,2) DEFAULT 2.0,
    win_amount BIGINT DEFAULT 0 CHECK (win_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED', -- ACCEPTED, WON, LOST, CANCELLED, REFUNDED
    idempotency_key VARCHAR(100) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS settlements (
    id VARCHAR(64) PRIMARY KEY,
    bet_id VARCHAR(64) UNIQUE NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
    round_id VARCHAR(64) NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    win_amount BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'SETTLED',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deposits (
    id VARCHAR(64) PRIMARY KEY,
    deposit_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UTR_SUBMITTED', 'CONFIRMED', 'REJECTED', 'EXPIRED')),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'UPI',
    utr VARCHAR(100) UNIQUE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    admin_id VARCHAR(64),
    admin_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS withdrawals (
    id VARCHAR(64) PRIMARY KEY,
    withdrawal_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'REJECTED')),
    payout_method VARCHAR(50) NOT NULL DEFAULT 'UPI',
    payout_address_or_upi VARCHAR(256) NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processing_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    admin_id VARCHAR(64),
    admin_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    action VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Games Catalog
INSERT INTO games (id, title, status, entry_fee, min_stake, max_stake)
VALUES 
    ('seven_up_down', '7 Up Down (Dice)', 'LIVE', 1000, 1000, 500000),
    ('dragon_tiger', 'Dragon Vs Tiger', 'COMING_SOON', 1000, 1000, 500000),
    ('mines', 'Mines', 'COMING_SOON', 1000, 1000, 500000),
    ('crush', 'Crush', 'COMING_SOON', 1000, 1000, 500000)
ON CONFLICT (id) DO UPDATE SET 
    status = EXCLUDED.status,
    title = EXCLUDED.title;

-- Ensure existing tables receive new financial columns if created in prior versions
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
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS balance_before BIGINT NOT NULL DEFAULT 0;
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS balance_after BIGINT NOT NULL DEFAULT 0;
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'CREDIT';
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50) DEFAULT 'DEPOSIT';
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'COMPLETED';

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
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100) UNIQUE;

-- Indexes for High Performance Query Execution & Scale
CREATE INDEX IF NOT EXISTS idx_bets_user_created ON bets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_ref ON wallet_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_status ON game_rounds(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_wid ON withdrawals(withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_did ON deposits(deposit_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_utr_unique ON deposits(utr) WHERE utr IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

-- Game round enrichment (sec 21, 22, 28): provably-fair seed hash + authoritative
-- crash point for recovery. ADD COLUMN IF NOT EXISTS keeps this idempotent.
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS server_seed_hash VARCHAR(128);
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS crash_point NUMERIC(6,2);
CREATE INDEX IF NOT EXISTS idx_game_rounds_game_status ON game_rounds(game_id, status);
CREATE INDEX IF NOT EXISTS idx_settlements_round ON settlements(round_id);

-- Admin Panel Migrations
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED';
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Onboarding Migrations
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;


CREATE TABLE IF NOT EXISTS promotions (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    subtitle VARCHAR(255) DEFAULT 'DEPOSIT -> GET BONUS',
    tag VARCHAR(50) DEFAULT 'DEPOSIT',
    button_text VARCHAR(50) DEFAULT 'DEPOSIT NOW',
    image_url VARCHAR(255) DEFAULT '/banners/deposit_banner.png',
    target_screen VARCHAR(100) DEFAULT '/add-cash',
    description TEXT,
    type VARCHAR(30) NOT NULL DEFAULT 'CUSTOM',
    bonus_amount BIGINT NOT NULL DEFAULT 0,
    min_deposit BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS subtitle VARCHAR(255) DEFAULT 'DEPOSIT -> GET BONUS';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS tag VARCHAR(50) DEFAULT 'DEPOSIT';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS button_text VARCHAR(50) DEFAULT 'DEPOSIT NOW';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT '/banners/deposit_banner.png';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS target_screen VARCHAR(100) DEFAULT '/add-cash';

INSERT INTO promotions (id, title, subtitle, tag, button_text, type, bonus_amount, min_deposit, status)
VALUES ('promo_default_180', 'DEPOSIT BONUS' || E'\n' || '180% BONUS', 'DEPOSIT -> GET BONUS', 'DEPOSIT', 'DEPOSIT NOW', 'WELCOME', 18000, 10000, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Audit log enrichment (sec 49): attribute actions to an admin and a target resource.
-- ADD COLUMN IF NOT EXISTS keeps this idempotent for pre-existing databases.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS admin_id VARCHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id, created_at DESC);

-- Admins Table for RBAC Admin Authentication
CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'GAME_ADMIN', -- SUPER_ADMIN, FINANCE_ADMIN, GAME_ADMIN, SUPPORT_ADMIN
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

