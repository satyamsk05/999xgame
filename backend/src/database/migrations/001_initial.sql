-- 001_initial.sql — base schema for the 999xGame / InGames money-flow platform.
--
-- RULES (sec 28/29):
--   * Money is stored as BIGINT integer PAISE (₹10.00 = 1000 paise). Never floats.
--   * Every statement is idempotent (CREATE TABLE IF NOT EXISTS / INSERT ... ON CONFLICT).
--   * This migration NEVER drops a table and NEVER deletes production data.

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
    type VARCHAR(40) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    direction VARCHAR(10) NOT NULL DEFAULT 'CREDIT' CHECK (direction IN ('CREDIT', 'DEBIT')),
    reference_type VARCHAR(50) NOT NULL DEFAULT 'DEPOSIT',
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
    status VARCHAR(20) NOT NULL DEFAULT 'COMING_SOON',
    entry_fee BIGINT NOT NULL DEFAULT 1000,
    min_stake BIGINT NOT NULL DEFAULT 1000,
    max_stake BIGINT NOT NULL DEFAULT 100000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_rounds (
    id VARCHAR(64) PRIMARY KEY,
    game_id VARCHAR(50) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round_number BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED',
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
    bet_type VARCHAR(50) NOT NULL,
    stake BIGINT NOT NULL CHECK (stake > 0),
    payout_multiplier NUMERIC(5,2) DEFAULT 2.0,
    win_amount BIGINT DEFAULT 0 CHECK (win_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED',
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

CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'GAME_ADMIN',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed the initial games catalog (idempotent upsert; never deletes).
INSERT INTO games (id, title, status, entry_fee, min_stake, max_stake)
VALUES
    ('seven_up_down', '7 Up Down (Dice)', 'LIVE', 1000, 1000, 500000),
    ('dragon_tiger', 'Dragon Vs Tiger', 'COMING_SOON', 1000, 1000, 500000),
    ('mines', 'Mines', 'COMING_SOON', 1000, 1000, 500000),
    ('crush', 'Crush', 'COMING_SOON', 1000, 1000, 500000)
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    title = EXCLUDED.title;

-- Seed the default welcome promotion (idempotent; never overwrites edits).
INSERT INTO promotions (id, title, subtitle, tag, button_text, type, bonus_amount, min_deposit, status)
VALUES ('promo_default_180', 'DEPOSIT BONUS' || E'\n' || '180% BONUS', 'DEPOSIT -> GET BONUS', 'DEPOSIT', 'DEPOSIT NOW', 'WELCOME', 18000, 10000, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
