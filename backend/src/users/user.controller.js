const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const userRepo = require('./user.repository');
const walletRepo = require('../wallet/wallet.repository');
const logger = require('../utils/logger');

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
        avatarPath: user.avatar_path || 'assets/avatar/avatar_1.png',
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

module.exports = router;
