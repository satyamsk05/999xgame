const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');
const { signToken } = require('../src/auth/jwt');
const { gameManager } = require('../src/games/game.manager');
const { sevenUpDownEngine } = require('../src/games/seven-up-down/engine');

async function waitForCurrentRound(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (sevenUpDownEngine.currentRound) return sevenUpDownEngine.currentRound;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('7 Up Down worker did not create a current round within the test timeout.');
}

test('7 Up Down Game Controller API Tests', (t, done) => {
  const server = http.createServer(app);
  server.listen(0, async () => {
    const port = server.address().port;
    try {
      await gameManager.init(null);
      await waitForCurrentRound();

      const { user } = await userRepo.findOrCreateUserByPhone('+919876543210');
      await walletRepo.addCash(user.id, 500, 'TEST_DEPOSIT');
      const token = signToken({ userId: user.id, phone: '+919876543210' });

      const makeRequest = (path, method = 'GET', body = null, headers = {}) => new Promise((resolve, reject) => {
        const req = http.request({ hostname: 'localhost', port, path, method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try { resolve({ statusCode: res.statusCode, body: JSON.parse(data) }); }
            catch (_) { resolve({ statusCode: res.statusCode, body: data }); }
          });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      });

      const roundRes = await makeRequest('/api/games/7updown/current-round');
      assert.strictEqual(roundRes.statusCode, 200);
      assert.strictEqual(roundRes.body.status, 'success');
      assert.strictEqual(roundRes.body.data.gameId, 'seven_up_down');
      assert.ok(roundRes.body.data.currentRound.roundId);
      const roundId = roundRes.body.data.currentRound.roundId;

      const singleBetRes = await makeRequest('/api/games/7updown/bets', 'POST', {
        roundId, betType: 'UP', stake: 20, idempotencyKey: `test_bet_${Date.now()}_1`,
      }, { Authorization: `Bearer ${token}` });
      assert.strictEqual(singleBetRes.statusCode, 200);
      assert.strictEqual(singleBetRes.body.status, 'success');
      assert.strictEqual(singleBetRes.body.data.bets.length, 1);
      assert.strictEqual(singleBetRes.body.data.bets[0].betType, 'UP');

      const batchBetRes = await makeRequest('/api/games/7updown/bets', 'POST', {
        roundId,
        bets: [
          { betType: 'SEVEN', stakePaise: 1000, idempotencyKey: `batch_1_${Date.now()}` },
          { betType: 'DOWN', stakePaise: 1000, idempotencyKey: `batch_2_${Date.now()}` },
        ],
      }, { Authorization: `Bearer ${token}` });
      assert.strictEqual(batchBetRes.statusCode, 200);
      assert.strictEqual(batchBetRes.body.status, 'success');
      assert.strictEqual(batchBetRes.body.data.bets.length, 2);

      const historyRes = await makeRequest('/api/games/7updown/history');
      assert.strictEqual(historyRes.statusCode, 200);
      assert.strictEqual(historyRes.body.status, 'success');
      assert.ok(Array.isArray(historyRes.body.data));

      const deprecatedRes = await makeRequest('/api/games/join', 'POST', { gameId: 'seven_up_down' }, { Authorization: `Bearer ${token}` });
      assert.strictEqual(deprecatedRes.statusCode, 400);
      assert.strictEqual(deprecatedRes.body.status, 'error');

      await gameManager.stopAll();
      server.close(done);
    } catch (err) {
      await gameManager.stopAll().catch(() => {});
      server.close();
      done(err);
    }
  });
});
