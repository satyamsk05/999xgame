const express = require('express');
const router = express.Router();
const logginService = require('./loggin.service');
const userRepo = require('../users/user.repository');
const { signToken } = require('./jwt');
const logger = require('../utils/logger');

// 1. Create Loggin WhatsApp Verification Token & Link
router.post('/loggin/create-token', (req, res) => {
  try {
    const { token, link, expiresAt } = logginService.createToken();
    return res.status(200).json({
      status: 'success',
      data: {
        token,
        link,
        expiresAt,
      },
    });
  } catch (err) {
    logger.error('Failed to generate Loggin WhatsApp token', { error: err.message });
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
});

// 2. Server-Side Token Verification & PostgreSQL User Auth
// SECURITY RULE: Client phone parameter is NEVER trusted!
// Verified phone is retrieved strictly from Loggin server-side verification.
router.post('/loggin/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ status: 'error', message: 'Verification token is required' });
  }

  try {
    // Perform server-side Loggin SDK verification
    const { verifiedPhone } = await logginService.verifyToken(token);

    // Atomically find or create user and initial wallet in PostgreSQL (Starting ₹0 balance)
    const { user, wallet } = await userRepo.findOrCreateUserByPhone(verifiedPhone);

    // Generate real signed application JWT token with HMAC-SHA256
    const appJwtToken = signToken({
      userId: user.id,
      phone: user.phone,
    });

    // Return authenticated user state (Canonical + Backward Compatible)
    return res.status(200).json({
      status: 'success',
      message: 'WhatsApp authentication verified successfully',
      token: appJwtToken,
      data: {
        token: appJwtToken,
        user: {
          id: user.id,
          phone: user.phone,
          username: user.username,
          avatarPath: user.avatar_path || '/avatars/avatar_1.png',
        },
        wallet: {
          depositBalance: wallet.depositBalance,
          winningsBalance: wallet.winningsBalance,
          rewardsBalance: wallet.rewardsBalance,
          totalBalance: wallet.totalBalance,
        },
        id: user.id,
        phone: user.phone,
        username: user.username,
        avatarPath: user.avatar_path || '/avatars/avatar_1.png',
        depositBalance: wallet.depositBalance,
        winningsBalance: wallet.winningsBalance,
        rewardsBalance: wallet.rewardsBalance,
        totalBalance: wallet.totalBalance,
      },
    });
  } catch (err) {
    logger.error('Loggin WhatsApp verification error', { token, error: err.message });
    if (err.code === 'TOKEN_EXPIRED' || err.message.includes('expired')) {
      return res.status(410).json({
        status: 'error',
        code: 'TOKEN_EXPIRED',
        message: 'Loggin verification link expired (5 minutes timeout). Please tap WhatsApp Verification again to get a fresh link.',
      });
    }

    return res.status(401).json({
      status: 'error',
      code: 'VERIFICATION_FAILED',
      message: err.message || 'WhatsApp verification failed or was cancelled.',
    });
  }
});

module.exports = router;
