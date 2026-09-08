const { Pool } = require('pg');
const config = require('../config/env');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.warn('PostgreSQL pool connection error', { error: err.message || String(err) });
});

let isInitialized = false;
let useMemoryDb = false;

// Memory DB Store for Development Mode when PostgreSQL daemon is offline
class MemoryDbStore {
  constructor() {
    this.users = new Map();
    this.wallets = new Map();
    this.games = new Map([
      ['seven_up_down', { id: 'seven_up_down', title: '7 Up Down (Dice)', status: 'LIVE', entry_fee: 1000, min_stake: 1000, max_stake: 500000 }],
      ['dragon_tiger', { id: 'dragon_tiger', title: 'Dragon Vs Tiger', status: 'LIVE', entry_fee: 1000, min_stake: 1000, max_stake: 500000 }],
      ['crush', { id: 'crush', title: 'Crush', status: 'LIVE', entry_fee: 1000, min_stake: 1000, max_stake: 500000 }],
      ['mines', { id: 'mines', title: 'Mines', status: 'DISABLED', entry_fee: 1000, min_stake: 1000, max_stake: 500000 }],
    ]);
    this.game_rounds = new Map();
    this.bets = new Map();
    this.deposits = new Map();
    this.withdrawals = new Map();
    this.wallet_ledger = new Map();
    this.audit_logs = new Map();
    this.admins = new Map();
    this.promotions = new Map([
      ['promo_default_180', {
        id: 'promo_default_180',
        title: 'DEPOSIT BONUS\n180% BONUS',
        subtitle: 'DEPOSIT -> GET BONUS',
        tag: 'DEPOSIT',
        button_text: 'DEPOSIT NOW',
        image_url: '/banners/deposit_banner.png',
        target_screen: '/add-cash',
        status: 'ACTIVE',
      }],
    ]);
  }

  query(text, params = []) {
    const trimmed = text.trim().replace(/\s+/g, ' ');

    if (/^BEGIN/i.test(trimmed) || /^COMMIT/i.test(trimmed) || /^ROLLBACK/i.test(trimmed)) {
      return { rows: [], rowCount: 0 };
    }

    if (/SELECT 1/i.test(trimmed)) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }

    // SELECT FROM games
    if (/SELECT \* FROM games/i.test(trimmed)) {
      const rows = Array.from(this.games.values());
      return { rows, rowCount: rows.length };
    }

    // SELECT FROM users
    if (/SELECT \* FROM users WHERE phone = \$1 OR id = \$2/i.test(trimmed)) {
      const phone = params[0];
      const id = params[1];
      const found = Array.from(this.users.values()).filter(u => u.phone === phone || u.id === id);
      return { rows: found, rowCount: found.length };
    }

    if (/SELECT \* FROM users WHERE id = \$1/i.test(trimmed)) {
      const id = params[0];
      const found = this.users.get(id);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    // INSERT INTO users
    if (/INSERT INTO users/i.test(trimmed)) {
      const id = params[0];
      const phone = params[1];
      const username = params[2];
      const avatar_path = params[3] || 'assets/avatar/avatar_1.png';
      const user = { id, phone, username, avatar_path, is_blocked: false, is_onboarding_complete: false, created_at: new Date().toISOString() };
      this.users.set(id, user);
      return { rows: [user], rowCount: 1 };
    }

    // SELECT FROM wallets
    if (/SELECT \* FROM wallets WHERE user_id = \$1/i.test(trimmed)) {
      const userId = params[0];
      const wallet = this.wallets.get(userId) || { user_id: userId, available_balance: 0, reserved_balance: 0, deposit_balance: 0, winnings_balance: 0, rewards_balance: 0 };
      return { rows: [wallet], rowCount: 1 };
    }

    // INSERT INTO wallets
    if (/INSERT INTO wallets/i.test(trimmed)) {
      const id = params[0];
      const userId = params[1];
      const wallet = { id, user_id: userId, available_balance: 0, reserved_balance: 0, deposit_balance: 0, winnings_balance: 0, rewards_balance: 0 };
      this.wallets.set(userId, wallet);
      return { rows: [wallet], rowCount: 1 };
    }

    // UPDATE wallets
    if (/UPDATE wallets/i.test(trimmed)) {
      const userId = params[params.length - 1];
      let wallet = this.wallets.get(userId);
      if (!wallet) {
        wallet = { id: `wlt_${userId}`, user_id: userId, available_balance: 0, reserved_balance: 0, deposit_balance: 0, winnings_balance: 0, rewards_balance: 0 };
        this.wallets.set(userId, wallet);
      }
      return { rows: [wallet], rowCount: 1 };
    }

    // SELECT FROM promotions
    if (/SELECT \* FROM promotions/i.test(trimmed)) {
      const rows = Array.from(this.promotions.values());
      return { rows, rowCount: rows.length };
    }

    // INSERT INTO game_rounds
    if (/INSERT INTO game_rounds/i.test(trimmed)) {
      const id = params[0];
      const game_id = params[1];
      const round_number = params[2];
      const status = params[3];
      const server_seed = params[4];
      const round = { id, game_id, round_number, status, server_seed, created_at: new Date().toISOString() };
      this.game_rounds.set(id, round);
      return { rows: [round], rowCount: 1 };
    }

    // UPDATE game_rounds
    if (/UPDATE game_rounds/i.test(trimmed)) {
      const id = params[0];
      const status = params[1];
      let round = this.game_rounds.get(id);
      if (round) {
        round.status = status;
      } else {
        round = { id, status };
        this.game_rounds.set(id, round);
      }
      return { rows: [round], rowCount: 1 };
    }

    // SELECT FROM game_rounds
    if (/SELECT \* FROM game_rounds/i.test(trimmed)) {
      const rows = Array.from(this.game_rounds.values());
      return { rows, rowCount: rows.length };
    }

    // INSERT INTO bets
    if (/INSERT INTO bets/i.test(trimmed)) {
      const id = params[0];
      const round_id = params[1];
      const user_id = params[2];
      const bet_type = params[3];
      const stake = params[4];
      const payout_multiplier = params[5] || 2.0;
      const status = 'ACCEPTED';
      const bet = { id, round_id, user_id, bet_type, stake, payout_multiplier, status, created_at: new Date().toISOString() };
      this.bets.set(id, bet);
      return { rows: [bet], rowCount: 1 };
    }

    // Default empty fallback
    return { rows: [], rowCount: 0 };
  }
}

const memoryDb = new MemoryDbStore();

async function initDb() {
  if (isInitialized) return;
  try {
    const client = await pool.connect();
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(sql);
      }
      isInitialized = true;
      useMemoryDb = false;
      logger.info('PostgreSQL money flow schema initialized & migrated successfully');
    } finally {
      client.release();
    }
  } catch (err) {
    useMemoryDb = true;
    isInitialized = true;
    logger.warn(`PostgreSQL connection failed (${err.message || String(err)}). Activated Development In-Memory DB Mode.`);
  }
}

async function query(text, params) {
  if (!isInitialized) await initDb();
  if (useMemoryDb) {
    return memoryDb.query(text, params);
  }

  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed DB Query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.warn('DB Query failed', { text, error: err.message || String(err) });
    throw err;
  }
}

async function getClient() {
  if (!isInitialized) await initDb();
  if (useMemoryDb) {
    return {
      query: async (text, params) => memoryDb.query(text, params),
      release: () => {},
    };
  }
  return await pool.connect();
}

module.exports = {
  pool,
  query,
  getClient,
  initDb,
};
