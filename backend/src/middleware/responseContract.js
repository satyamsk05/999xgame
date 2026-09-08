/**
 * Unified API response contract (sec 31) implemented as an ADDITIVE compatibility
 * layer.
 *
 * The historical envelope `{ status: 'success'|'error', data|message }` is still
 * emitted because the Flutter client and the test suite depend on it. On top of it,
 * every JSON response is stamped with the preferred contract:
 *
 *   success: true                      // success/ok/ready envelopes
 *   success: false, error: { code, message }   // error/unready envelopes
 *
 * Centralizing this in ONE res.json wrapper standardizes ALL responses (routes,
 * the 404 handler and the error handler) without editing every controller and
 * without breaking existing consumers. When the compatibility layer is retired,
 * controllers can drop `status`/flat `message` and keep `success`/`error`.
 */

const STATUS_CODE_MAP = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_SERVER_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/** Map an HTTP status to a stable, non-leaky error code (sec 32). */
function defaultCodeForStatus(statusCode) {
  if (STATUS_CODE_MAP[statusCode]) return STATUS_CODE_MAP[statusCode];
  return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
}

const SUCCESS_STATUSES = new Set(['success', 'ok', 'ready']);
const ERROR_STATUSES = new Set(['error', 'unready']);

function responseContract(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function augmentJson(body) {
    try {
      if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.status === 'string') {
        if (SUCCESS_STATUSES.has(body.status)) {
          if (typeof body.success === 'undefined') body.success = true;
        } else if (ERROR_STATUSES.has(body.status)) {
          if (typeof body.success === 'undefined') body.success = false;
          if (!body.error || typeof body.error !== 'object') {
            body.error = {
              code: body.code || defaultCodeForStatus(res.statusCode),
              message: body.message || 'Request failed',
            };
          }
        }
      }
    } catch (_) {
      // Contract shaping must NEVER break the actual response payload.
    }
    return originalJson(body);
  };

  next();
}

module.exports = responseContract;
module.exports.defaultCodeForStatus = defaultCodeForStatus;
module.exports.STATUS_CODE_MAP = STATUS_CODE_MAP;
