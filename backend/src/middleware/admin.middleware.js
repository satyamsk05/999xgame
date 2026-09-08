/**
 * COMPATIBILITY RE-EXPORT (sec 5).
 *
 * There must be ONE canonical admin authentication implementation. It lives in
 * `admin_auth.middleware.js`. This file only re-exports it so any legacy import path
 * (`require('../middleware/admin.middleware')`) resolves to the same middleware and RBAC
 * helper instead of a second, divergent implementation.
 *
 * Note: this exports an OBJECT `{ adminMiddleware, requireRole }` — callers must
 * destructure it (e.g. `const { adminMiddleware } = require('../middleware/admin.middleware')`).
 */
module.exports = require('./admin_auth.middleware');
