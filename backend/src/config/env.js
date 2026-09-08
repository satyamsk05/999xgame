const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT || '5050', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'ingames_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_key_999x',
  // Dedicated secret for ADMIN tokens. Falls back to JWT_SECRET only in dev; production
  // validation below requires a strong, explicitly provided value.
  adminJwtSecret:
    process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev_admin_jwt_secret_key_999x',
  // Legacy master secret. NO LONGER used for normal admin auth. Retained only so the
  // isolated, default-disabled break-glass mechanism can compare against a dedicated value.
  adminSecret: process.env.ADMIN_SECRET || 'dev_admin_secret_key_999x',
  jwt: {
    issuer: process.env.JWT_ISSUER || '999xgame',
    audience: process.env.JWT_AUDIENCE || '999xgame-app',
    adminAudience: process.env.ADMIN_JWT_AUDIENCE || '999xgame-admin',
    algorithm: 'HS256',
    userTtlSeconds: parseInt(process.env.JWT_TTL_SECONDS || String(7 * 24 * 3600), 10),
    adminTtlSeconds: parseInt(process.env.ADMIN_JWT_TTL_SECONDS || String(12 * 3600), 10),
  },
  // Emergency break-glass admin access — DISABLED by default (sec 6). When enabled it
  // requires a dedicated secret and is audited loudly. Never a normal login path.
  adminBreakGlass: {
    enabled: process.env.ADMIN_BREAK_GLASS_ENABLED === 'true',
    secret: process.env.ADMIN_BREAK_GLASS_SECRET || '',
  },
  logginAppKey: process.env.LOGGIN_APP_KEY || 'loggin_app_key_dev',
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  deposit: {
    minAmountRupees: 10,
    maxAmountRupees: 100000,
    upiId: process.env.PAYMENT_UPI_ID || 'pay.ingames@bank',
    merchantName: process.env.PAYMENT_MERCHANT_NAME || '999x InGames Platform',
  },
  withdrawal: {
    minAmountRupees: 100,
    maxAmountRupees: 50000,
  },
};

function validateConfig() {
  const errors = [];
  const isProd = config.nodeEnv === 'production';

  if (isProd) {
    // Secrets (sec 63): production must fail closed on missing/weak secrets.
    if (!process.env.JWT_SECRET || config.jwtSecret === 'dev_jwt_secret_key_999x') {
      errors.push('JWT_SECRET must be explicitly set to a strong value in production.');
    }
    if (!process.env.ADMIN_JWT_SECRET || config.adminJwtSecret === 'dev_admin_jwt_secret_key_999x') {
      errors.push('ADMIN_JWT_SECRET must be explicitly set to a strong value in production.');
    }
    if (config.jwtSecret.length < 32 || config.adminJwtSecret.length < 32) {
      errors.push('JWT_SECRET and ADMIN_JWT_SECRET must each be at least 32 characters in production.');
    }
    // Database credentials are mandatory (PostgreSQL is the only authoritative store).
    if (!config.db.host || !config.db.name || !config.db.user || !config.db.password) {
      errors.push('DB_HOST, DB_NAME, DB_USER and DB_PASSWORD must be set in production.');
    }
    if (config.db.password === 'postgres') {
      errors.push('DB_PASSWORD must not use the insecure default value in production.');
    }
    // Break-glass, if enabled, needs a dedicated secret distinct from the legacy default.
    if (config.adminBreakGlass.enabled) {
      if (!config.adminBreakGlass.secret || config.adminBreakGlass.secret === 'dev_admin_secret_key_999x') {
        errors.push('ADMIN_BREAK_GLASS_SECRET must be set to a dedicated strong secret when break-glass is enabled.');
      }
    }
    if (config.corsOrigin === '*') {
      errors.push('CORS_ORIGIN must be restricted to explicit origins in production.');
    }
  }

  if (errors.length) {
    throw new Error(`FATAL configuration error(s):\n- ${errors.join('\n- ')}`);
  }
}

validateConfig();

module.exports = config;
