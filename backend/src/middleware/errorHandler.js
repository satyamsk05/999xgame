const logger = require('../utils/logger');
const { defaultCodeForStatus, STATUS_CODE_MAP } = require('./responseContract');

/**
 * Centralized error handler (sec 52) + HTTP status rules (sec 32).
 *
 * Emits the standardized error envelope:
 *   { success: false, error: { code, message }, requestId }
 * while keeping the backward-compatible `status: 'error'` / flat `message` fields
 * for the Flutter client and existing tests.
 *
 * Rules:
 *   - Detailed error (incl. stack) is logged server-side only.
 *   - Stack traces are NEVER exposed in production.
 *   - Unexpected 500s in production return a generic public message (no internals).
 *   - Raw driver codes (e.g. pg '23505') are not leaked as the public error code;
 *     they are mapped to a stable semantic code from the HTTP status.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isProd = process.env.NODE_ENV === 'production';

  let statusCode = parseInt(err && err.statusCode, 10);
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) statusCode = 500;

  const rawCode = err && typeof err.code === 'string' ? err.code : null;
  // A semantic code is a human string, not a 5-char SQLSTATE like '23505'/'57P01'.
  const isSemanticCode = rawCode && !/^[0-9A-Z]{5}$/.test(rawCode);
  const code = isSemanticCode ? rawCode : (STATUS_CODE_MAP[statusCode] || defaultCodeForStatus(statusCode));

  const publicMessage = (statusCode === 500 && isProd)
    ? 'An unexpected server error occurred. Please try again shortly.'
    : ((err && err.message) || 'Internal Server Error');

  logger.error((err && err.message) || 'Unhandled error', {
    requestId: req.id,
    url: req.originalUrl,
    method: req.method,
    statusCode,
    code,
    stack: err && err.stack,
  });

  res.status(statusCode).json({
    success: false,
    status: 'error',
    error: { code, message: publicMessage },
    code,
    message: publicMessage,
    requestId: req.id,
    ...(!isProd && err && err.stack ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
