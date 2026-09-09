-- 006_remove_game_entry_fees.sql
-- Games do not charge a separate entry fee. Betting stake remains controlled by min_stake/max_stake.
UPDATE games SET entry_fee = 0 WHERE entry_fee <> 0;
