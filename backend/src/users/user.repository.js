const { query, getClient } = require('../database/db');
const logger = require('../utils/logger');

/**
 * Find user by phone number or create new user + wallet atomically in PostgreSQL
 * SECURITY RULE: Phone number MUST come from server-side Loggin SDK verification!
 * New user starts with ₹0 balance.
 */
async function findOrCreateUserByPhone(verifiedPhone) {
  if (typeof verifiedPhone !== 'string') {
    throw new Error('Verified phone number is required');
  }

  const cleanDigits = verifiedPhone.replace(/[^0-9]/g, '');
  if (cleanDigits.length < 8 || cleanDigits.length > 15) {
    throw new Error('Invalid verified phone number');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const userId = `usr_${cleanDigits}`;

    // Existing account lookup. Both phone and deterministic ID are checked so
    // alternate phone formatting cannot accidentally create a second account.
    const findRes = await client.query(
      'SELECT * FROM users WHERE phone = $1 OR id = $2 LIMIT 1',
      [verifiedPhone, userId]
    );

    let user;
    if (findRes.rows.length > 0) {
      user = findRes.rows[0];
    } else {
      const defaultUsername = `Player_${verifiedPhone.slice(-4)}`;
      const avatarPath = 'assets/avatar/avatar_1.png';

      // DO NOTHING handles a concurrent first login safely. If another request
      // wins the unique phone/id race, we fetch that committed row below instead
      // of surfacing a duplicate-key error to the user.
      const insertUserRes = await client.query(
        `INSERT INTO users (id, phone, username, avatar_path, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [userId, verifiedPhone, defaultUsername, avatarPath]
      );

      if (insertUserRes.rows.length > 0) {
        user = insertUserRes.rows[0];
        logger.info('Created new PostgreSQL user', { userId });
      } else {
        const concurrentRes = await client.query(
          'SELECT * FROM users WHERE phone = $1 OR id = $2 LIMIT 1',
          [verifiedPhone, userId]
        );
        if (concurrentRes.rows.length === 0) {
          throw new Error('Unable to create or load verified user');
        }
        user = concurrentRes.rows[0];
      }

      // Always ensure a wallet exists, including for accounts created by another
      // concurrent request or legacy accounts missing their wallet row.
      const walletId = `wlt_${user.id}`;
      await client.query(
        `INSERT INTO wallets (id, user_id, available_balance, reserved_balance, deposit_balance, winnings_balance, rewards_balance, locked_balance, version, created_at, updated_at)
         VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 1, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [walletId, user.id]
      );
    }

    // Existing users also need a wallet guarantee. This is intentionally inside
    // the same transaction as user lookup/creation.
    const walletId = `wlt_${user.id}`;
    await client.query(
      `INSERT INTO wallets (id, user_id, available_balance, reserved_balance, deposit_balance, winnings_balance, rewards_balance, locked_balance, version, created_at, updated_at)
       VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 1, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [walletId, user.id]
    );

    const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [user.id]);
    if (walletRes.rows.length === 0) {
      throw new Error('User wallet could not be initialized');
    }
    const wallet = walletRes.rows[0];

    await client.query('COMMIT');

    return {
      user,
      wallet: {
        depositBalance: parseInt(wallet.deposit_balance || 0, 10) / 100,
        winningsBalance: parseInt(wallet.winnings_balance || 0, 10) / 100,
        rewardsBalance: parseInt(wallet.rewards_balance || 0, 10) / 100,
        availableBalance: parseInt(wallet.available_balance || 0, 10) / 100,
        reservedBalance: parseInt(wallet.reserved_balance || 0, 10) / 100,
        totalBalance: (parseInt(wallet.available_balance || 0, 10) + parseInt(wallet.reserved_balance || 0, 10)) / 100,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to find/create user in PostgreSQL', { error: err.message });
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

/**
 * Get User Payout Methods (Bank & UPI)
 */
async function getPayoutMethods(userId) {
  try {
    const res = await query(
      `SELECT bank_account_number, bank_ifsc, bank_account_holder, bank_name, upi_id, upi_name
       FROM users WHERE id = $1`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      bankAccountNumber: row.bank_account_number || '',
      bankIfsc: row.bank_ifsc || '',
      bankAccountHolder: row.bank_account_holder || '',
      bankName: row.bank_name || '',
      upiId: row.upi_id || '',
      upiName: row.upi_name || '',
      isBankLinked: !!(row.bank_account_number && row.bank_ifsc),
      isUpiLinked: !!(row.upi_id),
    };
  } catch (err) {
    logger.error('Failed to get payout methods in PostgreSQL DB', { userId, error: err.message });
    throw err;
  }
}

/**
 * Update User Payout Methods (Bank & UPI)
 */
async function updatePayoutMethods(userId, { bankAccountNumber, bankIfsc, bankAccountHolder, bankName, upiId, upiName }) {
  try {
    const res = await query(
      `UPDATE users
       SET bank_account_number = COALESCE($2, bank_account_number),
           bank_ifsc = COALESCE($3, bank_ifsc),
           bank_account_holder = COALESCE($4, bank_account_holder),
           bank_name = COALESCE($5, bank_name),
           upi_id = COALESCE($6, upi_id),
           upi_name = COALESCE($7, upi_name),
           updated_at = NOW()
       WHERE id = $1
       RETURNING bank_account_number, bank_ifsc, bank_account_holder, bank_name, upi_id, upi_name`,
      [
        userId,
        bankAccountNumber !== undefined ? bankAccountNumber : null,
        bankIfsc !== undefined ? bankIfsc : null,
        bankAccountHolder !== undefined ? bankAccountHolder : null,
        bankName !== undefined ? bankName : null,
        upiId !== undefined ? upiId : null,
        upiName !== undefined ? upiName : null,
      ]
    );
    if (res.rows.length === 0) throw new Error('User not found');
    const row = res.rows[0];
    return {
      bankAccountNumber: row.bank_account_number || '',
      bankIfsc: row.bank_ifsc || '',
      bankAccountHolder: row.bank_account_holder || '',
      bankName: row.bank_name || '',
      upiId: row.upi_id || '',
      upiName: row.upi_name || '',
      isBankLinked: !!(row.bank_account_number && row.bank_ifsc),
      isUpiLinked: !!(row.upi_id),
    };
  } catch (err) {
    logger.error('Failed to update payout methods in PostgreSQL DB', { userId, error: err.message });
    throw err;
  }
}

module.exports = {
  findOrCreateUserByPhone,
  getUserById,
  updateUserProfile,
  completeOnboarding,
  getPayoutMethods,
  updatePayoutMethods,
};

