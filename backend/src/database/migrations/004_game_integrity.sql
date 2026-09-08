-- 004_game_integrity.sql — provably-fair + crash recovery columns for game rounds.
--
-- RULES (sec 21/22/23/24/28/29): idempotent; never drops or mutates existing data.
--   * server_seed_hash: committed hash revealed after settlement (provably fair).
--   * crash_point: authoritative Crush crash multiplier persisted for recovery.
--   * uq_game_round_number: DB-derived round numbers must never collide per game.

ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS server_seed_hash VARCHAR(128);
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS crash_point NUMERIC(6,2);

-- Enforce per-game round_number uniqueness WITHOUT destroying legacy data.
--   * Fresh DBs already have the constraint inline (001) -> we skip.
--   * Clean legacy DBs -> we add the constraint.
--   * Dirty legacy DBs (duplicate round_numbers produced by the old in-memory
--     roundCounter before the DB-derived MAX+1 fix) -> we SKIP and emit a NOTICE.
--     Renumbering historical rounds would mutate/destroy audit data, which sec 28
--     forbids. New rounds use DB-derived MAX+1 numbers so they never collide going
--     forward; the constraint becomes enforceable once legacy duplicates age out.
DO $$
DECLARE
    dup_groups INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_game_round_number' AND conrelid = 'game_rounds'::regclass
    ) THEN
        RETURN;
    END IF;

    SELECT COUNT(*) INTO dup_groups FROM (
        SELECT game_id, round_number
        FROM game_rounds
        GROUP BY game_id, round_number
        HAVING COUNT(*) > 1
    ) d;

    IF dup_groups = 0 THEN
        ALTER TABLE game_rounds ADD CONSTRAINT uq_game_round_number UNIQUE (game_id, round_number);
    ELSE
        RAISE NOTICE
            'Skipping uq_game_round_number: % duplicate (game_id, round_number) group(s) exist in legacy data. New rounds use DB-derived MAX+1 numbers and will not collide.',
            dup_groups;
    END IF;
END $$;
