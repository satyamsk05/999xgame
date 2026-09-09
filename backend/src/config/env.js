const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function csv(value, fallback = []) {
  const source = value == null || value === '' ? fallback : value.split(',');
  return source.map((item) => String(item).trim()).filter(Boolean);
}

function parseRedisConfig() {
  const rawUrl = process.env.REDIS_URL;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('REDIS_URL must use redis:// or rediss://');
      return {
        url: rawUrl,
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
        password: decodeURIComponent(url.password || ''),
        tls: url.protocol === 'rediss:',
      };
    } catch (err) {
      throw new Error(`Invalid REDIS_URL: ${err.message}`);
    }
  }
  return {
    url: null,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    tls: false,
  };
}

const config = {
  port: parseInt(process.env.PORT || '5050', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: csv(process.env.CORS_ORIGIN, ['http://localhost:3000']),
  trustProxy: process.env.TRUST_PROXY === 'true',
  bodyLimit: process.env.BODY_LIMIT || '1mb',
  maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
  minimumAppVersion: process.env.MINIMUM_APP_VERSION || '1.0.0',
  onlineTickerRingColors: csv(process.env.ONLINE_TICKER_RING_COLORS, ['#FFC107', '#FF9800', '#4FC3F7']),
  onlineTickerAvatars: csv(process.env.ONLINE_TICKER_AVATARS, [
    '/avatars/avatar_1.png', '/avatars/avatar_2.png', '/avatars/avatar_3.png',
    '/avatars/avatar_7.png', '/avatars/avatar_8.png', '/avatars/avatar_9.png',
  ]),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'ingames_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    sslCa: process.env.DB_SSL_CA || '',
  },
  redis: parseRedisConfig(),
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_key_999x',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev_admin_jwt_secret_key_999x',
  adminSecret: process.env.ADMIN_SECRET || 'dev_admin_secret_key_999x',
  jwt: {
    issuer: process.env.JWT_ISSUER || '999xgame',
    audience: process.env.JWT_AUDIENCE || '999xgame-app',
    adminAudience: process.env.ADMIN_JWT_AUDIENCE || '999xgame-admin',
    algorithm: 'HS256',
    userTtlSeconds: parseInt(process.env.JWT_TTL_SECONDS || String(7 * 24 * 3600), 10),
    adminTtlSeconds: parseInt(process.env.ADMIN_JWT_TTL_SECONDS || String(12 * 3600), 10),
  },
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
    if (!process.env.JWT_SECRET || config.jwtSecret === 'dev_jwt_secret_key_999x') errors.push('JWT_SECRET must be explicitly set to a strong value in production.');
    if (!process.env.ADMIN_JWT_SECRET || config.adminJwtSecret === 'dev_admin_jwt_secret_key_999x') errors.push('ADMIN_JWT_SECRET must be explicitly set to a strong value in production.');
    if (config.jwtSecret.length < 32 || config.adminJwtSecret.length < 32) errors.push('JWT_SECRET and ADMIN_JWT_SECRET must each be at least 32 characters in production.');
    if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) errors.push('DB_HOST, DB_NAME, DB_USER and DB_PASSWORD must be explicitly set in production.');
    if (config.db.password === 'postgres') errors.push('DB_PASSWORD must not use the insecure default value in production.');
    if (!process.env.REDIS_URL && (!process.env.REDIS_HOST || process.env.REDIS_HOST === 'localhost')) errors.push('REDIS_URL or a non-localhost REDIS_HOST must be explicitly configured in production.');
    if (process.env.DISABLE_REDIS === 'true') errors.push('DISABLE_REDIS=true is not permitted in production.');
    if (config.adminBreakGlass.enabled && (!config.adminBreakGlass.secret || config.adminBreakGlass.secret === 'dev_admin_secret_key_999x' || config.adminBreakGlass.secret.length < 32)) errors.push('ADMIN_BREAK_GLASS_SECRET must be a strong dedicated secret when break-glass is enabled.');
    if (!process.env.CORS_ORIGIN || config.corsOrigin.length === 0 || config.corsOrigin.includes('*')) errors.push('CORS_ORIGIN must be restricted to explicit origins in production.');
    if (config.trustProxy !== true) errors.push('TRUST_PROXY=true is required when running behind an AWS load balancer/proxy.');
    if (!process.env.PAYMENT_UPI_ID) errors.push('PAYMENT_UPI_ID must be explicitly configured in production.');
    if (!process.env.PAYMENT_MERCHANT_NAME) errors.push('PAYMENT_MERCHANT_NAME must be explicitly configured in production.');
    if (!process.env.MINIMUM_APP_VERSION) errors.push('MINIMUM_APP_VERSION must be explicitly configured in production.');
    if (!process.env.DB_SSL || config.db.ssl !== true) errors.push('DB_SSL=true is required in production.');
  }

  if (errors.length) throw new Error(`FATAL configuration error(s):\n- ${errors.join('\n- ')}`);
}

validateConfig();
module.exports = config;
