const https = require('https');
const logger = require('../utils/logger');
const config = require('../config/env');

const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN || config.telegram?.botToken || '';
const getChatId = () => process.env.TELEGRAM_CHAT_ID || config.telegram?.chatId || '';

/**
 * Send markdown/text message to configured Telegram channel
 * Critical Safety Rule: Telegram failure must NEVER throw or rollback financial DB operations!
 */
async function sendMessage(text) {
  const BOT_TOKEN = getBotToken();
  const CHAT_ID = getChatId();

  if (!BOT_TOKEN || !CHAT_ID || BOT_TOKEN === 'your_telegram_bot_token_here') {
    logger.debug('Telegram notification skipped (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured)');
    return false;
  }

  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });

      const req = https.request(
        {
          hostname: 'api.telegram.org',
          port: 443,
          path: `/bot${BOT_TOKEN}/sendMessage`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              logger.info('Telegram notification sent successfully');
              resolve(true);
            } else {
              logger.warn('Telegram API returned non-200 status', { statusCode: res.statusCode, body: data });
              resolve(false);
            }
          });
        }
      );

      req.on('error', (err) => {
        logger.warn('Telegram message request failed', { error: err.message });
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        logger.warn('Telegram request timed out after 5000ms');
        resolve(false);
      });

      req.write(payload);
      req.end();
    } catch (err) {
      logger.warn('Unexpected error in Telegram sendMessage', { error: err.message });
      resolve(false);
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Event Notification Helpers
async function notifyDepositCreated({ depositId, userId, amountRupees }) {
  const msg = `💰 <b>Deposit Requested</b>\n<b>ID:</b> ${escapeHtml(depositId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}`;
  return sendMessage(msg);
}

async function notifyDepositUtrSubmitted({ depositId, userId, amountRupees, utr }) {
  const msg = `📥 <b>Deposit UTR Submitted</b>\n<b>ID:</b> ${escapeHtml(depositId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>UTR:</b> <code>${escapeHtml(utr)}</code>`;
  return sendMessage(msg);
}

async function notifyDepositConfirmed({ depositId, userId, amountRupees, adminId }) {
  const msg = `✅ <b>Deposit Confirmed</b>\n<b>ID:</b> ${escapeHtml(depositId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>Approved By:</b> ${escapeHtml(adminId)}`;
  return sendMessage(msg);
}

async function notifyDepositRejected({ depositId, userId, amountRupees, reason }) {
  const msg = `❌ <b>Deposit Rejected</b>\n<b>ID:</b> ${escapeHtml(depositId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>Reason:</b> ${escapeHtml(reason || 'N/A')}`;
  return sendMessage(msg);
}

async function notifyWithdrawalRequested({ withdrawalId, userId, amountRupees, upiId }) {
  const msg = `💸 <b>Withdrawal Requested</b>\n<b>ID:</b> ${escapeHtml(withdrawalId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>UPI:</b> <code>${escapeHtml(upiId)}</code>`;
  return sendMessage(msg);
}

async function notifyWithdrawalProcessing({ withdrawalId, userId, amountRupees }) {
  const msg = `⏳ <b>Withdrawal Processing</b>\n<b>ID:</b> ${escapeHtml(withdrawalId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}`;
  return sendMessage(msg);
}

async function notifyWithdrawalConfirmed({ withdrawalId, userId, amountRupees, adminId }) {
  const msg = `✅ <b>Withdrawal Confirmed</b>\n<b>ID:</b> ${escapeHtml(withdrawalId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>Processed By:</b> ${escapeHtml(adminId)}`;
  return sendMessage(msg);
}

async function notifyWithdrawalRejected({ withdrawalId, userId, amountRupees, reason }) {
  const msg = `❌ <b>Withdrawal Rejected</b>\n<b>ID:</b> ${escapeHtml(withdrawalId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>Reason:</b> ${escapeHtml(reason || 'N/A')}`;
  return sendMessage(msg);
}

async function notifyLargeBet({ gameId, roundId, userId, amountRupees }) {
  const msg = `🎲 <b>Large Bet Placed</b>\n<b>Game:</b> ${escapeHtml(gameId)}\n<b>Round:</b> ${escapeHtml(roundId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Stake:</b> ₹${amountRupees}`;
  return sendMessage(msg);
}

async function notifySystemAlert({ type, message, details }) {
  const msg = `🚨 <b>SYSTEM ALERT: ${escapeHtml(type)}</b>\n<b>Message:</b> ${escapeHtml(message)}\n<b>Details:</b> <code>${escapeHtml(JSON.stringify(details || {}))}</code>`;
  return sendMessage(msg);
}

module.exports = {
  sendMessage,
  notifyDepositCreated,
  notifyDepositUtrSubmitted,
  notifyDepositConfirmed,
  notifyDepositRejected,
  notifyWithdrawalRequested,
  notifyWithdrawalProcessing,
  notifyWithdrawalConfirmed,
  notifyWithdrawalRejected,
  notifyLargeBet,
  notifySystemAlert,
  isConfigured: () => Boolean(getBotToken() && getChatId() && getBotToken() !== 'your_telegram_bot_token_here'),
};
