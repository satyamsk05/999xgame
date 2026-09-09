const https = require('https');
const logger = require('../utils/logger');
const config = require('../config/env');

const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN || config.telegram?.botToken || '';
const getChatId = () => process.env.TELEGRAM_CHAT_ID || config.telegram?.chatId || '';
const getAdminPanelUrl = () => process.env.ADMIN_PANEL_URL || 'http://65.1.92.155/admin';

async function sendMessage(text, replyMarkup = undefined) {
  const BOT_TOKEN = getBotToken();
  const CHAT_ID = getChatId();
  if (!BOT_TOKEN || !CHAT_ID || BOT_TOKEN === 'your_telegram_bot_token_here') {
    logger.debug('Telegram notification skipped (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured)');
    return false;
  }

  return new Promise((resolve) => {
    try {
      const payloadObject = { chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true };
      if (replyMarkup) payloadObject.reply_markup = replyMarkup;
      const payload = JSON.stringify(payloadObject);
      const req = https.request({ hostname: 'api.telegram.org', port: 443, path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) { logger.info('Telegram notification sent successfully'); resolve(true); }
          else { logger.warn('Telegram API returned non-200 status', { statusCode: res.statusCode, body: data }); resolve(false); }
        });
      });
      req.on('error', (err) => { logger.warn('Telegram message request failed', { error: err.message }); resolve(false); });
      req.on('timeout', () => { req.destroy(); logger.warn('Telegram request timed out after 5000ms'); resolve(false); });
      req.write(payload); req.end();
    } catch (err) { logger.warn('Unexpected error in Telegram sendMessage', { error: err.message }); resolve(false); }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyDepositCreated({ depositId, userId, amountRupees }) {
  const msg = `💰 <b>Deposit Requested</b>\n<b>ID:</b> ${escapeHtml(depositId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}`;
  return sendMessage(msg);
}

async function notifyDepositUtrSubmitted({ depositId, userId, amountRupees, utr }) {
  const msg = `📥 <b>Deposit UTR Submitted</b>\n<b>ID:</b> ${escapeHtml(depositId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>UTR:</b> <code>${escapeHtml(utr)}</code>`;
  const replyMarkup = { inline_keyboard: [[{ text: '✅ OPEN ADMIN TO CONFIRM', url: getAdminPanelUrl() }]] };
  return sendMessage(msg, replyMarkup);
}

async function notifyDepositConfirmed({ depositId, userId, amountRupees, adminId }) {
  return sendMessage(`✅ <b>Deposit Confirmed</b>\n<b>ID:</b> ${escapeHtml(depositId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>Approved By:</b> ${escapeHtml(adminId)}`);
}
async function notifyDepositRejected({ depositId, userId, amountRupees, reason }) {
  return sendMessage(`❌ <b>Deposit Rejected</b>\n<b>ID:</b> ${escapeHtml(depositId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>Reason:</b> ${escapeHtml(reason || 'N/A')}`);
}
async function notifyWithdrawalRequested({ withdrawalId, userId, amountRupees, upiId }) {
  return sendMessage(`💸 <b>Withdrawal Requested</b>\n<b>ID:</b> ${escapeHtml(withdrawalId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>UPI:</b> <code>${escapeHtml(upiId)}</code>`);
}
async function notifyWithdrawalProcessing({ withdrawalId, userId, amountRupees }) { return sendMessage(`⏳ <b>Withdrawal Processing</b>\n<b>ID:</b> ${escapeHtml(withdrawalId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}`); }
async function notifyWithdrawalConfirmed({ withdrawalId, userId, amountRupees, adminId }) { return sendMessage(`✅ <b>Withdrawal Confirmed</b>\n<b>ID:</b> ${escapeHtml(withdrawalId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>Processed By:</b> ${escapeHtml(adminId)}`); }
async function notifyWithdrawalRejected({ withdrawalId, userId, amountRupees, reason }) { return sendMessage(`❌ <b>Withdrawal Rejected</b>\n<b>ID:</b> ${escapeHtml(withdrawalId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Amount:</b> ₹${amountRupees}\n<b>Reason:</b> ${escapeHtml(reason || 'N/A')}`); }
async function notifyLargeBet({ gameId, roundId, userId, amountRupees }) { return sendMessage(`🎲 <b>Large Bet Placed</b>\n<b>Game:</b> ${escapeHtml(gameId)}\n<b>Round:</b> ${escapeHtml(roundId)}\n<b>User:</b> ${escapeHtml(userId)}\n<b>Stake:</b> ₹${amountRupees}`); }
async function notifySystemAlert({ type, message, details }) { return sendMessage(`🚨 <b>SYSTEM ALERT: ${escapeHtml(type)}</b>\n<b>Message:</b> ${escapeHtml(message)}\n<b>Details:</b> <code>${escapeHtml(JSON.stringify(details || {}))}</code>`); }

module.exports = { sendMessage, notifyDepositCreated, notifyDepositUtrSubmitted, notifyDepositConfirmed, notifyDepositRejected, notifyWithdrawalRequested, notifyWithdrawalProcessing, notifyWithdrawalConfirmed, notifyWithdrawalRejected, notifyLargeBet, notifySystemAlert, isConfigured: () => Boolean(getBotToken() && getChatId() && getBotToken() !== 'your_telegram_bot_token_here') };
