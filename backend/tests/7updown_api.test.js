const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');
const { signToken } = require('../src/auth/jwt');

test('7 Up Down Game Controller API Tests', (t, done) => {
  const server = http.createServer(app);
  server.listen(0, async () => {
    const port = server.address().port;

    try {
      // 1. Setup authenticated user
      const { user } = await userRepo.findOrCreateUserByPhone('+919876543210');
      await walletRepo.addCash(user.id, 500, 'TEST_DEPOSIT');
      const token = signToken({ userId: user.id, phone: '+919876543210' });

      // Helper for HTTP requests
      const makeRequest = (path, method = 'GET', body = null, headers = {}) => {
        return new Promise((resolve, reject) => {
          const reqHeaders = {
            'Content-Type': 'application/json',
            ...headers,
          };
          const options = {
            hostname: 'localhost',
            port,
            path,
            method,
            headers: reqHeaders,
          };
          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                resolve({ statusCode: res.statusCode, body: parsed });
              } catch (e) {
                resolve({ statusCode: res.statusCode, body: data });
              }
            });
          });
          req.on('error', reject);
          if (body) {
            req.write(JSON.stringify(body));
          }
          req.end();
        });
      };

      // 2. GET /api/games/7updown/current-round
      const roundRes = await makeRequest('/api/games/7updown/current-round');
      assert.strictEqual(roundRes.statusCode, 200);
      assert.strictEqual(roundRes.body.status, 'success');
      assert.ok(roundRes.body.data.roundId);
      assert.strictEqual(roundRes.body.data.gameId, 'seven_up_down');

      const roundId = roundRes.body.data.roundId;

      // 3. POST /api/games/7updown/bets (Single Bet)
      const singleBetRes = await makeRequest('/api/games/7updown/bets', 'POST', {
        roundId,
        betType: 'UP',
        stake: 20,
        idempotencyKey: `test_bet_${Date.now()}_1`,
      }, { Authorization: `Bearer ${token}` });

      assert.strictEqual(singleBetRes.statusCode, 200);
      assert.strictEqual(singleBetRes.body.status, 'success');
      assert.strictEqual(singleBetRes.body.data.bets.length, 1);
      assert.strictEqual(singleBetRes.body.data.bets[0].betType, 'UP');

      // 4. POST /api/games/7updown/bets (Batch Bets)
      const batchBetRes = await makeRequest('/api/games/7updown/bets', 'POST', {
        roundId,
        bets: [
          { betType: 'SEVEN', stakePaise: 1000, idempotencyKey: `batch_1_${Date.now()}` },
          { betType: 'NUMBER_8', stakePaise: 1000, idempotencyKey: `batch_2_${Date.now()}` },
        ],
      }, { Authorization: `Bearer ${token}` });

      assert.strictEqual(batchBetRes.statusCode, 200);
      assert.strictEqual(batchBetRes.body.status, 'success');
      assert.strictEqual(batchBetRes.body.data.bets.length, 2);

      // 5. GET /api/games/7updown/history
      const historyRes = await makeRequest('/api/games/7updown/history');
      assert.strictEqual(historyRes.statusCode, 200);
      assert.strictEqual(historyRes.body.status, 'success');
      assert.ok(Array.isArray(historyRes.body.data));

      // 6. Deprecated POST /api/games/join returns HTTP 400
      const deprecatedRes = await makeRequest('/api/games/join', 'POST', { gameId: 'seven_up_down' }, { Authorization: `Bearer ${token}` });
      assert.strictEqual(deprecatedRes.statusCode, 400);
      assert.strictEqual(deprecatedRes.body.status, 'error');

      server.close(done);
    } catch (err) {
      server.close();
      done(err);
    }
  });
});
