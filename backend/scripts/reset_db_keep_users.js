const { query, pool } = require('../src/database/db');
const logger = require('../src/utils/logger');

async function resetDbKeepUsers() {
  console.log('--- Starting Database Cleanup (Preserving Users & Profiles) ---');
  try {
    // 1. Delete settlements, bets, game_rounds
    console.log('Clearing settlements...');
    await query('DELETE FROM settlements');

    console.log('Clearing bets...');
    await query('DELETE FROM bets');

    console.log('Clearing game_rounds...');
    await query('DELETE FROM game_rounds');

    // 2. Delete withdrawals, deposits, wallet_ledger
    console.log('Clearing withdrawals...');
    await query('DELETE FROM withdrawals');

    console.log('Clearing deposits...');
    await query('DELETE FROM deposits');

    console.log('Clearing wallet_ledger...');
    await query('DELETE FROM wallet_ledger');

    // 3. Clear notifications and audit_logs
    console.log('Clearing notifications...');
    await query('DELETE FROM notifications');

    console.log('Clearing audit_logs...');
    await query('DELETE FROM audit_logs');

    // 4. Reset wallet balances to zero (or initial) for all existing users
    console.log('Resetting wallet balances for existing users...');
    await query(`
      UPDATE wallets 
      SET available_balance = 0,
          reserved_balance = 0,
          deposit_balance = 0,
          winnings_balance = 0,
          rewards_balance = 0,
          locked_balance = 0,
          version = 1,
          updated_at = NOW()
    `);

    const usersCount = await query('SELECT count(*) as count FROM users');
    const walletsCount = await query('SELECT count(*) as count FROM wallets');
    const adminsCount = await query('SELECT count(*) as count FROM admins');

    console.log('====================================================');
    console.log('DATABASE CLEANUP COMPLETE');
    console.log(`Preserved Users: ${usersCount.rows[0]?.count}`);
    console.log(`Cleaned Wallets: ${walletsCount.rows[0]?.count}`);
    console.log(`Preserved Admins: ${adminsCount.rows[0]?.count}`);
    console.log('====================================================');
  } catch (err) {
    console.error('Database cleanup failed:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

resetDbKeepUsers();
