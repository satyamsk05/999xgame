const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');
const { signToken, verifyToken } = require('../src/auth/jwt');

test('user JWTs always contain a unique jti and verify as USER tokens', () => {
  const first = signToken({ userId: 'user-1' });
  const second = signToken({ userId: 'user-1' });

  const firstDecoded = verifyToken(first);
  const secondDecoded = verifyToken(second);

  assert.strictEqual(firstDecoded.type, 'USER');
  assert.strictEqual(secondDecoded.type, 'USER');
  assert.ok(firstDecoded.jti);
  assert.ok(secondDecoded.jti);
  assert.notStrictEqual(firstDecoded.jti, secondDecoded.jti);
  assert.strictEqual(firstDecoded.sub, 'user-1');
});

test('explicit user JWT jti is preserved', () => {
  const token = signToken({ userId: 'user-2', jti: 'test-jti-123' });
  const decoded = verifyToken(token);
  assert.strictEqual(decoded.jti, 'test-jti-123');
  assert.strictEqual(decoded.sub, 'user-2');
});

test('user JWT verification rejects tokens without jti', () => {
  const legacyToken = jwt.sign(
    { type: 'USER', sub: 'legacy-user' },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      expiresIn: 300,
    }
  );

  assert.throws(() => verifyToken(legacyToken), (err) => {
    assert.strictEqual(err.statusCode, 401);
    assert.strictEqual(err.code, 'TOKEN_INVALID');
    return true;
  });
});
