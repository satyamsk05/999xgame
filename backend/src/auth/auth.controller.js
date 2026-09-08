const express = require('express');
const router = express.Router();
const logginService = require('./loggin.service');
const userRepo = require('../users/user.repository');
const { signToken } = require('./jwt');
const logger = require('../utils/logger');

function serializeWallet(wallet = {}) {
  const availablePaise = parseInt(wallet.available_balance ?? 0, 10) || 0;
  const reservedPaise = parseInt(wallet.reserved_balance ?? 0, 10) || 0;
  const depositPaise = parseInt(wallet.deposit_balance ?? 0, 10) || 0;
  const winningsPaise = parseInt(wallet.winnings_balance ?? 0, 10) || 0;
  const rewardsPaise = parseInt(wallet.rewards_balance ?? 0, 10) || 0;
  return {
    depositBalance: depositPaise / 100,
    winningsBalance: winningsPaise / 100,
    rewardsBalance: rewardsPaise / 100,
    availableBalance: availablePaise / 100,
    reservedBalance: reservedPaise / 100,
    totalBalance: (availablePaise + reservedPaise) / 100,
    availablePaise,
    reservedPaise,
    depositPaise,
    winningsPaise,
    rewardsPaise,
  };
}

async function completeLoginFromVerifiedSession(token) {
  const session = await logginService.getStatus(token);
  if (!session || session.status === 'EXPIRED') return null;
  if (session.status !== 'VERIFIED' || !session.verifiedPhone) return { pending: session.status === 'PENDING' };

  const consumed = await logginService.consumeVerifiedSession(token);
  if (!consumed) return { consumed: true };

  const { user, wallet } = await userRepo.findOrCreateUserByPhone(consumed.verifiedPhone);
  if (user.is_blocked) return { blocked: true };

  const appJwtToken = signToken({ userId: user.id, phone: user.phone });
  const isOnboardingComplete = !!user.is_onboarding_complete;
  const isNewUser = !isOnboardingComplete;

  return {
    verified: true,
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
    wallet: serializeWallet(wallet),
  };
}

router.post('/loggin/create-token', async (req, res) => {
  try {
    const { token, link, expiresAt } = await logginService.createToken();
    return res.status(200).json({ status: 'success', data: { token, link, expiresAt } });
  } catch (err) {
    logger.error('Failed to generate Loggin WhatsApp token', { error: err.message });
    return res.status(500).json({ status: 'error', code: 'LOGIN_TOKEN_CREATE_FAILED', message: 'Unable to start WhatsApp authentication.' });
  }
});

router.get('/loggin/status/:token', async (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ status: 'error', message: 'Token is required' });

  try {
    const result = await completeLoginFromVerifiedSession(token);
    if (!result) {
      return res.status(410).json({ status: 'error', code: 'TOKEN_EXPIRED', message: 'Loggin verification link expired. Please generate a new link.' });
    }
    if (result.pending) {
      return res.status(200).json({ status: 'success', verificationStatus: 'PENDING', message: 'Verification is pending user action on WhatsApp.' });
    }
    if (result.consumed) {
      return res.status(409).json({ status: 'error', code: 'ALREADY_CONSUMED', message: 'This verification link has already been used.' });
    }
    if (result.blocked) {
      return res.status(403).json({ status: 'error', code: 'ACCOUNT_BLOCKED', message: 'Account is suspended or blocked. Please contact support.' });
    }

    return res.status(200).json({
      status: 'success',
      verificationStatus: 'VERIFIED',
      message: 'WhatsApp authentication verified successfully',
      token: result.token,
      isNewUser: result.isNewUser,
      data: {
        token: result.token,
        isNewUser: result.isNewUser,
        isOnboardingComplete: result.isOnboardingComplete,
        user: result.user,
        wallet: result.wallet,
      },
    });
  } catch (err) {
    logger.error('Loggin status check error', { error: err.message });
    return res.status(500).json({ status: 'error', code: 'LOGIN_STATUS_FAILED', message: 'Unable to complete authentication.' });
  }
});

router.post('/loggin/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ status: 'error', message: 'Verification token is required' });

  try {
    const result = await completeLoginFromVerifiedSession(token);
    if (!result) {
      return res.status(410).json({ status: 'error', code: 'TOKEN_EXPIRED', message: 'Loggin verification link expired. Please generate a new link.' });
    }
    if (result.pending) {
      return res.status(200).json({ status: 'success', verificationStatus: 'PENDING', message: 'WhatsApp verification is still pending.' });
    }
    if (result.consumed) {
      return res.status(409).json({ status: 'error', code: 'ALREADY_CONSUMED', message: 'Verification token already used.' });
    }
    if (result.blocked) {
      return res.status(403).json({ status: 'error', code: 'ACCOUNT_BLOCKED', message: 'Account is suspended or blocked. Please contact support.' });
    }

    return res.status(200).json({
      status: 'success',
      verificationStatus: 'VERIFIED',
      message: 'WhatsApp authentication verified successfully',
      token: result.token,
      isNewUser: result.isNewUser,
      data: {
        token: result.token,
        isNewUser: result.isNewUser,
        isOnboardingComplete: result.isOnboardingComplete,
        user: result.user,
        wallet: result.wallet,
      },
    });
  } catch (err) {
    logger.error('Loggin WhatsApp verification error', { error: err.message });
    return res.status(401).json({ status: 'error', code: err.code || 'VERIFICATION_FAILED', message: 'Verification failed. Please try again.' });
  }
});

module.exports = router;
