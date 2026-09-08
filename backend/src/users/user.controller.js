const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const userRepo = require('./user.repository');
const walletRepo = require('../wallet/wallet.repository');
const logger = require('../utils/logger');
const { query } = require('../database/db');

// Get Authenticated User Profile from PostgreSQL
router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const user = await userRepo.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const wallet = await walletRepo.getWalletByUserId(req.user.id);

    return res.status(200).json({
      status: 'success',
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        avatarPath: user.avatar_path || '/avatars/avatar_1.png',
        depositBalance: wallet.depositBalance,
        winningsBalance: wallet.winningsBalance,
        rewardsBalance: wallet.rewardsBalance,
        totalBalance: wallet.totalBalance,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /dashboard-header (Full structured response for Flutter dashboard header)
router.get('/dashboard-header', authMiddleware, async (req, res, next) => {
  try {
    const user = await userRepo.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const wallet = await walletRepo.getWalletByUserId(req.user.id);
    let games = [];
    try {
      const gamesRes = await query('SELECT * FROM games ORDER BY created_at ASC');
      games = gamesRes.rows.map((row) => ({
        id: row.id,
        title: row.title,
        imagePath: (row.id === 'seven_up_down' || row.id === '7updown') ? 'Assets/images/7updown.png' : `/games/${row.id}.png`,
        gameUrl: `/games/${row.id}/index.html`,
        accentColor: row.id === 'classic_dice' ? '#00E676' : (row.id === 'dragon_tiger' ? '#FFD700' : (row.id === 'seven_up_down' || row.id === '7updown' ? '#FF4081' : '#7C4DFF')),
        isAvailable: row.status === 'LIVE',
      }));
    } catch (_) {}

    return res.status(200).json({
      status: 'success',
      data: {
        profile: {
          id: user.id,
          username: user.username,
          phone: user.phone,
          avatarUrl: user.avatar_path || '/avatars/avatar_1.png',
          balance: wallet.totalBalance,
          // UI theme config — previously hardcoded in Flutter
          ringColor: '#E1B219',
          profileTag: 'Profile',
          profileTagColor: '#FFD700',
          profileTagBg: '#3B0A4E',
          walletGradientStart: '#00D294',
          walletGradientEnd: '#00A574',
          currencySymbol: '₹',
          addCashLabel: '+',
        },
        wallet: {
          depositBalance: wallet.depositBalance,
          winningsBalance: wallet.winningsBalance,
          rewardsBalance: wallet.rewardsBalance,
          totalBalance: wallet.totalBalance,
          availableBalance: wallet.availableBalance,
        },
        onlinePlayers: {
          totalOnline: 89214,
          label: 'online',
          formattedText: '89,214 online',
          ringColors: ['#FFC107', '#FF9800', '#40C4FF'],
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
        games: games.length > 0 ? games : [
          { id: 'seven_up_down', title: '7 Up Down', imagePath: 'Assets/images/7updown.png', accentColor: '#FF4081', gameUrl: '/games/seven_up_down/index.html', isAvailable: true },
          { id: 'dragon_tiger', title: 'Dragon Vs Tiger', imagePath: 'Assets/images/dtgame.png', accentColor: '#FFD700', gameUrl: '/games/dragon_tiger/index.html', isAvailable: true },
          { id: 'crush', title: 'Crush', imagePath: 'Assets/images/classic_dice.png', accentColor: '#00E676', gameUrl: '/games/crush/index.html', isAvailable: true },
          { id: 'mines', title: 'Mines', imagePath: 'Assets/images/mines.png', accentColor: '#7C4DFF', gameUrl: '/games/mines/index.html', isAvailable: false },
        ],
      },
    });
  } catch (err) {
    next(err);
  }
});



// Update User Profile (Username & Avatar)
router.post('/update-profile', authMiddleware, async (req, res, next) => {
  try {
    const { username, avatarPath } = req.body;
    const updatedUser = await userRepo.updateUserProfile(req.user.id, username, avatarPath);

    return res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        avatarPath: updatedUser.avatar_path,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Complete Onboarding — save name + DOB and mark user as onboarded (first login only)
router.post('/complete-onboarding', authMiddleware, async (req, res, next) => {
  try {
    const { username, dateOfBirth } = req.body;

    if (!username || username.trim().length < 2) {
      return res.status(400).json({ status: 'error', message: 'Name must be at least 2 characters.' });
    }

    const updatedUser = await userRepo.completeOnboarding(
      req.user.id,
      username.trim(),
      dateOfBirth || null
    );

    return res.status(200).json({
      status: 'success',
      message: 'Onboarding complete',
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        dateOfBirth: updatedUser.date_of_birth,
        isOnboardingComplete: updatedUser.is_onboarding_complete,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

