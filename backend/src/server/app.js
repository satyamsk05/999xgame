const express = require('express');
const cors = require('cors');
const config = require('../config/env');
const requestIdMiddleware = require('../middleware/requestId');
const responseContract = require('../middleware/responseContract');
const errorHandler = require('../middleware/errorHandler');
const { authLimiter, adminAuthLimiter, depositLimiter, withdrawalLimiter } = require('../middleware/rateLimit');

const path = require('path');
const authController = require('../auth/auth.controller');
const userController = require('../users/user.controller');
const gameController = require('../games/game.controller');
const walletController = require('../wallet/wallet.controller');
const depositController = require('../wallet/deposit.controller');
const adminDepositController = require('../wallet/admin_deposit.controller');
const withdrawalController = require('../wallet/withdrawal.controller');
const adminWithdrawalController = require('../wallet/admin_withdrawal.controller');
const adminAuthController = require('../admin/admin_auth.controller');
const adminStatsController = require('../admin/admin_stats.controller');
const adminUserController = require('../users/admin_user.controller');
const adminGamesController = require('../admin/admin_games.controller');
const adminPromotionsController = require('../admin/admin_promotions.controller');
const adminReportsController = require('../admin/admin_reports.controller');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestIdMiddleware);
// sec 31: stamp every JSON response with the unified contract (success/error envelope)
// as an additive compatibility layer over the legacy { status } shape.
app.use(responseContract);

// Serve Static Public Files & Web Admin Portal
app.use(express.static(path.join(__dirname, '../../public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin.html'));
});

// Active Online Presence Tracker
let activeSocketCountGetter = () => 0;

app.setOnlineUsersGetter = (fn) => {
  activeSocketCountGetter = fn;
};

const { query } = require('../database/db');

// Health & Readiness Endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ingames-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    return res.status(200).json({
      status: 'ready',
      db: 'connected',
      service: 'ingames-backend',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      status: 'unready',
      db: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// App Config & Realtime Online Users API
app.get('/api/config', (req, res) => {
  const realtimeOnlineUsers = activeSocketCountGetter();
  res.status(200).json({
    status: 'success',
    data: {
      onlineUsers: realtimeOnlineUsers,
      maintenanceMode: false,
      minimumAppVersion: '1.0.0',
    },
  });
});

app.get('/api/online-ticker', (req, res) => {
  const realtimeCount = activeSocketCountGetter();
  res.status(200).json({
    status: 'success',
    data: {
      totalOnline: realtimeCount,
      label: 'online',
      formattedText: `${realtimeCount.toLocaleString()} online`,
      ringColors: ['#FFC107', '#FF9800', '#4FC3F7'],
      avatars: [
        '/avatars/avatar_1.png',
        '/avatars/avatar_2.png',
        '/avatars/avatar_3.png',
        '/avatars/avatar_7.png',
        '/avatars/avatar_8.png',
        '/avatars/avatar_9.png',
      ],
      isLive: true,
    },
  });
});

app.get('/api/banners', async (req, res) => {
  try {
    const dbRes = await query(`SELECT * FROM promotions WHERE status = 'ACTIVE' ORDER BY created_at DESC`);
    const banners = dbRes.rows.map((row) => ({
      id: row.id,
      tag: row.tag || 'DEPOSIT',
      title: row.title,
      subtitle: row.subtitle || 'DEPOSIT -> GET BONUS',
      buttonText: row.button_text || 'DEPOSIT NOW',
      imageUrl: row.image_url || '/banners/deposit_banner.png',
      targetScreen: row.target_screen || '/add-cash',
    }));

    return res.status(200).json({
      status: 'success',
      data: banners,
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: 'Failed to retrieve active promotions from database',
    });
  }
});


// Mount Controllers
app.use('/api/auth', authLimiter, authController);
app.use('/api/user', userController);
app.use('/api/app', userController);
app.use('/api/games', gameController);

app.use('/api/wallet', walletController);
app.use('/api/deposits', depositLimiter, depositController);
app.use('/api/admin/auth', adminAuthLimiter, adminAuthController);
app.use('/api/admin/deposits', adminDepositController);
app.use('/api/withdrawals', withdrawalLimiter, withdrawalController);
app.use('/api/admin/withdrawals', adminWithdrawalController);
app.use('/api/admin/stats', adminStatsController);
app.use('/api/admin/users', adminUserController);
app.use('/api/admin/games', adminGamesController);
app.use('/api/admin/promotions', adminPromotionsController);
app.use('/api/admin/reports', adminReportsController);


// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    requestId: req.id,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use(errorHandler);

module.exports = app;
