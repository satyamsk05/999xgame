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
  adminSecret: process.env.ADMIN_SECRET || 'dev_admin_secret_key_999x',
  logginAppKey: process.env.LOGGIN_APP_KEY || 'loggin_app_key_dev',
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
  if (config.nodeEnv === 'production' && config.jwtSecret === 'dev_jwt_secret_key_999x') {
    throw new Error('FATAL: JWT_SECRET must be explicitly set in production!');
  }
}

validateConfig();

module.exports = config;
