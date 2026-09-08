const http = require('http');
const adminRepo = require('../../src/admin/admin.repository');

/**
 * Shared admin-auth test helper (sec 55).
 *
 * Tests MUST NOT rely on the removed X-Admin-Secret master bypass. The correct flow is:
 *   create test admin -> bcrypt-hash password -> POST /api/admin/auth/login -> admin JWT.
 * This helper performs exactly that so every admin test exercises real production auth.
 */

function postJson(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: buf ? JSON.parse(buf) : {} }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Provision (upsert) a real admin with a bcrypt-hashed password and return its credentials.
 */
async function ensureAdmin({ username, password, role = 'FINANCE_ADMIN', id } = {}) {
  const admin = await adminRepo.createAdmin({ id, username, password, role, isActive: true });
  return { admin, username, password, role };
}

/**
 * Log in over HTTP and return the admin JWT exactly as the admin portal would receive it.
 */
async function loginAdmin(port, { username, password }) {
  const res = await postJson(port, '/api/admin/auth/login', { username, password });
  if (res.statusCode !== 200) {
    throw new Error(`Admin login failed (${res.statusCode}): ${JSON.stringify(res.body)}`);
  }
  const token = res.body.token || (res.body.data && res.body.data.token);
  if (!token) throw new Error('Admin login did not return a token');
  return { token, admin: res.body.data && res.body.data.admin };
}

/**
 * Convenience: provision + login, returning { token, admin, username, password, role }.
 */
async function getAdminToken(port, opts = {}) {
  const creds = await ensureAdmin(opts);
  const { token, admin } = await loginAdmin(port, { username: creds.username, password: creds.password });
  return { token, admin, ...creds };
}

/**
 * Build an Authorization header object for an admin JWT.
 */
function adminAuthHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  ensureAdmin,
  loginAdmin,
  getAdminToken,
  adminAuthHeader,
  postJson,
};
