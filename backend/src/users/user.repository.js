const { query, getClient } = require('../database/db');
const logger = require('../utils/logger');

/**
 * Find user by phone number or create new user + wallet atomically in PostgreSQL
 * SECURITY RULE: Phone number MUST come from server-side Loggin SDK verification!
 * New user starts with ₹0 balance.
 */
async function findOrCreateUserByPhone(verifiedPhone) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Check if user exists by phone OR user ID
    const cleanDigits = verifiedPhone.replace(/[^0-9]/g, '');
    const userId = `usr_${cleanDigits}`;
    const findRes = await client.query('SELECT * FROM users WHERE phone = $1 OR id = $2', [verifiedPhone, userId]);
    
    let user;
    if (findRes.rows.length > 0) {
      user = findRes.rows[0];
    } else {
      // 2. Create new user
      const defaultUsername = `Player_${verifiedPhone.slice(-4)}`;
      const avatarPath = 'assets/avatar/avatar_1.png';

      const insertUserRes = await client.query(
        `INSERT INTO users (id, phone, username, avatar_path, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone
         RETURNING *`,
        [userId, verifiedPhone, defaultUsername, avatarPath]
      );
      user = insertUserRes.rows[0];

      // 3. Create new user wallet with ₹0 initial balance
      const walletId = `wlt_${userId}`;
      await client.query(
        `INSERT INTO wallets (id, user_id, available_balance, reserved_balance, deposit_balance, winnings_balance, rewards_balance, locked_balance, version, created_at, updated_at)
         VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 1, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [walletId, userId]
      );

      logger.info('Created new PostgreSQL user and initial zero-balance wallet', { userId, verifiedPhone });
    }

    // Fetch latest wallet
    const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [user.id]);
    const wallet = walletRes.rows[0] || { deposit_balance: 0, winnings_balance: 0, rewards_balance: 0 };

    await client.query('COMMIT');

    return {
      user,
      wallet: {
        depositBalance: parseInt(wallet.deposit_balance || 0, 10) / 100,
        winningsBalance: parseInt(wallet.winnings_balance || 0, 10) / 100,
        rewardsBalance: parseInt(wallet.rewards_balance || 0, 10) / 100,
        totalBalance: (parseInt(wallet.deposit_balance || 0, 10) + parseInt(wallet.winnings_balance || 0, 10) + parseInt(wallet.rewards_balance || 0, 10)) / 100,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to find/create user in PostgreSQL', { verifiedPhone, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get User Profile by User ID
 */
async function getUserById(userId) {
  try {
    const res = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to get user profile from PostgreSQL DB', { userId, error: err.message });
    throw err;
  }
}

/**
 * Update Username / Avatar / DOB
 */
async function updateUserProfile(userId, username, avatarPath, dateOfBirth) {
  try {
    const res = await query(
      `UPDATE users 
       SET username = COALESCE($2, username),
           avatar_path = COALESCE($3, avatar_path),
           date_of_birth = COALESCE($4, date_of_birth),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [userId, username, avatarPath, dateOfBirth || null]
    );
    if (res.rows.length === 0) throw new Error('User not found');
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to update user profile in PostgreSQL DB', { userId, error: err.message });
    throw err;
  }
}

/**
 * Complete Onboarding — save name + DOB and mark is_onboarding_complete = true atomically
 */
async function completeOnboarding(userId, username, dateOfBirth) {
  try {
    const res = await query(
      `UPDATE users
       SET username = COALESCE($2, username),
           date_of_birth = COALESCE($3::date, date_of_birth),
           is_onboarding_complete = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [userId, username || null, dateOfBirth || null]
    );
    if (res.rows.length === 0) throw new Error('User not found');
    logger.info('Onboarding completed', { userId, username, dateOfBirth });
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to complete onboarding in PostgreSQL DB', { userId, error: err.message });
    throw err;
  }
}

module.exports = {
  findOrCreateUserByPhone,
  getUserById,
  updateUserProfile,
  completeOnboarding,
};

