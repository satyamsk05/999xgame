const express = require('express');
const router = express.Router();
const logginService = require('./loggin.service');
const userRepo = require('../users/user.repository');
const { signToken } = require('./jwt');
const logger = require('../utils/logger');

// 1. Create Loggin WhatsApp Verification Token & Link
router.post('/loggin/create-token', async (req, res) => {
  try {
    const { token, link, expiresAt } = await logginService.createToken();
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

// 2. Short-Polling Verification Status Endpoint
router.get('/loggin/status/:token', async (req, res) => {
  const { token } = req.params;
  if (!token) {
    return res.status(400).json({ status: 'error', message: 'Token is required' });
  }

  try {
    const session = await logginService.getStatus(token);
    if (!session || session.status === 'EXPIRED') {
      return res.status(410).json({
        status: 'error',
        code: 'TOKEN_EXPIRED',
        message: 'Loggin verification link expired. Please generate a new link.',
      });
    }

    if (session.status === 'PENDING') {
      return res.status(200).json({
        status: 'success',
        verificationStatus: 'PENDING',
        message: 'Verification is pending user action on WhatsApp.',
      });
    }

    if (session.status === 'VERIFIED' && session.verifiedPhone) {
      // Consume session so verification succeeds exactly once
      const consumed = await logginService.consumeVerifiedSession(token);
      if (!consumed) {
        return res.status(409).json({
          status: 'error',
          code: 'ALREADY_CONSUMED',
          message: 'This verification link has already been used.',
        });
      }

      // Atomically find or create user and wallet
      const { user, wallet } = await userRepo.findOrCreateUserByPhone(session.verifiedPhone);

      // Blocked account check
      if (user.is_blocked) {
        return res.status(403).json({
          status: 'error',
          code: 'ACCOUNT_BLOCKED',
          message: 'Account is suspended or blocked. Please contact support.',
        });
      }

      const appJwtToken = signToken({
        userId: user.id,
        phone: user.phone,
      });

      const isOnboardingComplete = !!user.is_onboarding_complete;
      const isNewUser = !isOnboardingComplete;

      return res.status(200).json({
        status: 'success',
        verificationStatus: 'VERIFIED',
        message: 'WhatsApp authentication verified successfully',
        token: appJwtToken,
        isNewUser,
        data: {
          token: appJwtToken,
          isNewUser,
          isOnboardingComplete,
          user: {
            id: user.id,
            phone: user.phone,
            username: user.username,
            avatarPath: user.avatar_path || '/avatars/avatar_1.png',
            dateOfBirth: user.date_of_birth || null,
            isOnboardingComplete,
          },
          wallet: {
            depositBalance: wallet.depositBalance,
            winningsBalance: wallet.winningsBalance,
            rewardsBalance: wallet.rewardsBalance,
            totalBalance: wallet.totalBalance,
          },
        },
      });
    }

    return res.status(400).json({
      status: 'error',
      code: 'VERIFICATION_FAILED',
      message: 'WhatsApp verification failed or was cancelled.',
    });
  } catch (err) {
    logger.error('Loggin status check error', { token, error: err.message });
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. Non-blocking Server-Side Verification Endpoint (Backward Compatible)
router.post('/loggin/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ status: 'error', message: 'Verification token is required' });
  }

  try {
    const session = await logginService.getStatus(token);
    if (!session || session.status === 'EXPIRED') {
      return res.status(410).json({
        status: 'error',
        code: 'TOKEN_EXPIRED',
        message: 'Loggin verification link expired (5 minutes timeout).',
      });
    }

    if (session.status === 'PENDING') {
      return res.status(200).json({
        status: 'success',
        verificationStatus: 'PENDING',
        message: 'WhatsApp verification is still pending.',
      });
    }

    if (session.status === 'VERIFIED' && session.verifiedPhone) {
      const consumed = await logginService.consumeVerifiedSession(token);
      if (!consumed) {
        return res.status(409).json({
          status: 'error',
          code: 'ALREADY_CONSUMED',
          message: 'Verification token already used.',
        });
      }

      const { user, wallet } = await userRepo.findOrCreateUserByPhone(session.verifiedPhone);

      if (user.is_blocked) {
        return res.status(403).json({
          status: 'error',
          code: 'ACCOUNT_BLOCKED',
          message: 'Account is suspended or blocked. Please contact support.',
        });
      }

      const appJwtToken = signToken({
        userId: user.id,
        phone: user.phone,
      });

      const isOnboardingComplete = !!user.is_onboarding_complete;
      const isNewUser = !isOnboardingComplete;

      return res.status(200).json({
        status: 'success',
        verificationStatus: 'VERIFIED',
        message: 'WhatsApp authentication verified successfully',
        token: appJwtToken,
        isNewUser,
        data: {
          token: appJwtToken,
          isNewUser,
          isOnboardingComplete,
          user: {
            id: user.id,
            phone: user.phone,
            username: user.username,
            avatarPath: user.avatar_path || '/avatars/avatar_1.png',
            dateOfBirth: user.date_of_birth || null,
            isOnboardingComplete,
          },
          wallet: {
            depositBalance: wallet.depositBalance,
            winningsBalance: wallet.winningsBalance,
            rewardsBalance: wallet.rewardsBalance,
            totalBalance: wallet.totalBalance,
          },
        },
      });
    }

    return res.status(400).json({
      status: 'error',
      code: 'VERIFICATION_FAILED',
      message: 'WhatsApp verification failed.',
    });
  } catch (err) {
    logger.error('Loggin WhatsApp verification error', { token, error: err.message });
    return res.status(401).json({
      status: 'error',
      code: 'VERIFICATION_FAILED',
      message: err.message,
    });
  }
});

module.exports = router;
