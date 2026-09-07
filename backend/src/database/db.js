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
  logger.warn('PostgreSQL pool connection event', { error: err.message });
});

let isInitialized = false;

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
      logger.info('PostgreSQL money flow schema initialized & migrated');
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn('PostgreSQL auto-migration skipped', { error: err.message });
  }
}

async function query(text, params) {
  if (!isInitialized) await initDb();
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed DB Query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.warn('DB Query failed', { text, error: err.message });
    throw err;
  }
}

async function getClient() {
  if (!isInitialized) await initDb();
  return await pool.connect();
}

module.exports = {
  pool,
  query,
  getClient,
  initDb,
};
