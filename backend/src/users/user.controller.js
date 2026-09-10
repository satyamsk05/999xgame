const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const userRepo = require('./user.repository');
const walletRepo = require('../wallet/wallet.repository');
const logger = require('../utils/logger');
const { query } = require('../database/db');
const config = require('../config/env');

// Get Authenticated User Profile from PostgreSQL
router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const user = await userRepo.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const wallet = await walletRepo.getWalletByUserId(req.user.id);

    const payoutMethods = await userRepo.getPayoutMethods(req.user.id);

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
        payoutMethods: payoutMethods || {
          bankAccountNumber: '',
          bankIfsc: '',
          bankAccountHolder: '',
          bankName: '',
          upiId: '',
          upiName: '',
          isBankLinked: false,
          isUpiLinked: false,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /payout-methods (User's linked Bank Account & UPI ID)
router.get('/payout-methods', authMiddleware, async (req, res, next) => {
  try {
    const payoutMethods = await userRepo.getPayoutMethods(req.user.id);
    return res.status(200).json({
      status: 'success',
      data: payoutMethods || {
        bankAccountNumber: '',
        bankIfsc: '',
        bankAccountHolder: '',
        bankName: '',
        upiId: '',
        upiName: '',
        isBankLinked: false,
        isUpiLinked: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /payout-methods (Save/Update Bank Account & UPI ID)
router.post('/payout-methods', authMiddleware, async (req, res, next) => {
  try {
    const { bankAccountNumber, bankIfsc, bankAccountHolder, bankName, upiId, upiName } = req.body;

    const payload = {};

    if (bankAccountNumber !== undefined) {
      const cleanAcc = String(bankAccountNumber).trim();
      if (cleanAcc && (cleanAcc.length < 8 || cleanAcc.length > 30 || !/^\d+$/.test(cleanAcc))) {
        return res.status(400).json({ status: 'error', message: 'Invalid Bank Account Number. Must be 8 to 30 digits.' });
      }
      payload.bankAccountNumber = cleanAcc;
    }

    if (bankIfsc !== undefined) {
      const cleanIfsc = String(bankIfsc).trim().toUpperCase();
      if (cleanIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
        return res.status(400).json({ status: 'error', message: 'Invalid IFSC code format (e.g. SBIN0001234)' });
      }
      payload.bankIfsc = cleanIfsc;
    }

    if (bankAccountHolder !== undefined) {
      payload.bankAccountHolder = String(bankAccountHolder).trim();
    }

    if (bankName !== undefined) {
      payload.bankName = String(bankName).trim();
    }

    if (upiId !== undefined) {
      const cleanUpi = String(upiId).trim();
      if (cleanUpi && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(cleanUpi)) {
        return res.status(400).json({ status: 'error', message: 'Invalid UPI ID format (e.g. username@bank)' });
      }
      payload.upiId = cleanUpi;
    }

    if (upiName !== undefined) {
      payload.upiName = String(upiName).trim();
    }

    const updated = await userRepo.updatePayoutMethods(req.user.id, payload);
    return res.status(200).json({
      status: 'success',
      message: 'Payout methods updated successfully',
      data: updated,
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
    const gamesRes = await query('SELECT * FROM games ORDER BY created_at ASC');
    const games = gamesRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      imagePath: (row.id === 'seven_up_down' || row.id === '7updown') ? 'Assets/images/7updown.png' : `/games/${row.id}.png`,
      gameUrl: `/games/${row.id}/index.html`,
      accentColor: row.id === 'classic_dice' ? '#00E676' : (row.id === 'dragon_tiger' ? '#FFD700' : (row.id === 'seven_up_down' || row.id === '7updown' ? '#FF4081' : '#7C4DFF')),
      isAvailable: row.status === 'LIVE',
    }));

    const onlineCount = typeof req.app.getOnlineUsersCount === 'function'
      ? req.app.getOnlineUsersCount()
      : 0;

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
          totalOnline: onlineCount,
          label: 'online',
          formattedText: `${onlineCount.toLocaleString()} online`,
          ringColors: config.onlineTickerRingColors,
          avatars: config.onlineTickerAvatars,
          isLive: true,
        },
        games,
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

const { validateDateOfBirth } = require('../utils/validation');

// Complete Onboarding — save name + DOB and mark user as onboarded (first login only)
router.post('/complete-onboarding', authMiddleware, async (req, res, next) => {
  try {
    const { username, dateOfBirth } = req.body;

    if (!username || username.trim().length < 2) {
      return res.status(400).json({ status: 'error', message: 'Name must be at least 2 characters.' });
    }

    const validatedDob = validateDateOfBirth(dateOfBirth);

    const updatedUser = await userRepo.completeOnboarding(
      req.user.id,
      username.trim(),
      validatedDob
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
