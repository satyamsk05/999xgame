-- 005_indexes.sql — performance + uniqueness indexes.
--
-- RULES (sec 28/29): every statement is CREATE INDEX IF NOT EXISTS (idempotent).
-- Column-level UNIQUE constraints (wallet user_id, deposit_id, withdrawal_id, UTR,
-- bet/ledger idempotency_key, settlement bet_id) are declared inline in 001_initial.

CREATE INDEX IF NOT EXISTS idx_bets_user_created ON bets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_ref ON wallet_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_status ON game_rounds(status);
CREATE INDEX IF NOT EXISTS idx_game_rounds_game_status ON game_rounds(game_id, status);
CREATE INDEX IF NOT EXISTS idx_settlements_round ON settlements(round_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_wid ON withdrawals(withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_did ON deposits(deposit_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_utr_unique ON deposits(utr) WHERE utr IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id, created_at DESC);
