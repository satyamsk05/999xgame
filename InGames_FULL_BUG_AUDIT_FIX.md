# InGames Full Bug Audit & Fix Implementation Plan

## Scope

Focus areas:

1. Login / Loggin WhatsApp authentication
2. Telegram integration
3. Admin Panel
4. 7 Up Down live game synchronization
5. Dragon Tiger / Crush readiness
6. Wallet / money safety
7. Flutter ↔ backend API contracts
8. Realtime Socket.IO
9. Database / deployment reliability
10. Tests and regression coverage

> **Important:** This is a static code audit. The included backend test suite was also invoked, but the extracted test environment did not have `node_modules` installed, so 11/12 test files failed at module loading (`express`, `dotenv`, `pg`, etc.). The schema-only test passed. Do not treat the current test run as proof that the business logic passes.

---

# P0 — MUST FIX BEFORE REAL-MONEY PRODUCTION

## P0.1 Login verification creates concurrent server-side waits

### Files

- `backend/src/auth/loggin.service.js`
- `backend/src/auth/auth.controller.js`
- `lib/screens/login_screen.dart`

### Problem

The Flutter client calls:

`POST /api/auth/loggin/verify`

with a **12 second client timeout**.

But the backend calls:

`loggin.waitForVerify(token, timeoutMs)`

with a default timeout of **300 seconds**.

Therefore:

1. Flutter sends verify request.
2. Backend waits up to 5 minutes.
3. Flutter times out after 12 seconds.
4. Flutter retries.
5. Backend is still waiting for the previous request.
6. Multiple server-side verification listeners can exist for the same token.
7. This can produce delayed, duplicated, or inconsistent login behaviour.

### Fix

Do **not** use a long blocking HTTP request for verification.

Implement one of these:

### Recommended

Use short polling:

`POST /auth/loggin/create-token`

returns:

- token
- link
- expiresAt

Then:

`GET /auth/loggin/status/:token`

returns one of:

- `PENDING`
- `VERIFIED`
- `EXPIRED`
- `FAILED`

Each request must complete quickly.

The SDK verification listener should run in a controlled server-side session and update the session state exactly once.

### Required guarantees

- One active verification session per token.
- Token expires after 5 minutes.
- Verification can only succeed once.
- Repeated status calls are safe.
- Server never trusts phone number supplied by Flutter.
- Successful verification atomically creates/finds the user and wallet.

---

# P0.2 Loggin sessions are stored only in process memory

### File

`backend/src/auth/loggin.service.js`

### Problem

```js
const activeTokens = new Map();
```

This breaks when:

- Render/hosting restarts the server.
- Multiple backend instances are running.
- Process crashes.
- Load balancing sends create-token and verify requests to different instances.

### Fix

Store verification sessions in Redis.

Example:

```text
loggin:session:<token>
```

Data:

```json
{
  "status": "PENDING",
  "createdAt": "...",
  "expiresAt": "...",
  "link": "..."
}
```

TTL:

`300 seconds`

On successful verification:

```text
status = VERIFIED
phone = verified phone
```

Delete/expire the session after it is consumed.

---

# P0.3 Telegram is completely missing

### Evidence

There is no Telegram service/controller in backend source.

`public/admin/js/pages/notifications.js` explicitly contains:

```js
const hasTelegram = false;
```

The UI says Telegram should be configured through:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

but the backend does not actually implement the notification delivery system.

### Required implementation

Create:

```text
backend/src/services/telegram.service.js
```

Responsibilities:

- validate configuration
- send Telegram message
- retry transient failures
- timeout requests
- never block financial transactions
- log success/failure without logging bot token
- escape/format user-controlled values

Create event notification helpers:

```text
notifyDepositCreated()
notifyDepositUtrSubmitted()
notifyDepositConfirmed()
notifyDepositRejected()

notifyWithdrawalRequested()
notifyWithdrawalProcessing()
notifyWithdrawalConfirmed()
notifyWithdrawalRejected()

notifyLargeBet()
notifySystemAlert()
```

### Important

Telegram notification failure must **never** make a successful money transaction fail.

Correct:

```text
DB transaction -> COMMIT
                  |
                  +--> queue/send Telegram
```

Not:

```text
Telegram -> DB transaction
```

---

# P0.4 Realtime Socket event names DO NOT MATCH

### Backend emits

`backend/src/games/seven-up-down/seven_up_down.scheduler.js`

```text
7ud:round_open
7ud:dice_rolled
7ud:round_settled
```

### Frontend listens

`backend/public/games/seven_up_down/src/network/GameSocket.js`

```text
ROUND_CREATED
BETTING_CLOSED
ROUND_RESULT
WALLET_UPDATED
BET_SETTLED
```

These are different event names.

### Result

The frontend cannot reliably react to the server's actual game lifecycle.

### Fix

Define a single protocol.

Recommended:

```text
GAME_ROUND_OPEN
GAME_BETTING_CLOSED
GAME_RESULT
GAME_ROUND_SETTLED
GAME_WALLET_UPDATED
GAME_BET_ACCEPTED
GAME_BET_REJECTED
```

Every event must contain:

```json
{
  "version": 1,
  "gameId": "seven_up_down",
  "roundId": "...",
  "serverTime": "...",
  "sequence": 123,
  "payload": {}
}
```

The client must ignore stale sequence numbers.

---

# P0.5 Socket.IO has no authentication middleware

### File

`backend/src/server/http.js`

The server accepts:

```js
io.on('connection', ...)
```

but does not verify the JWT supplied by the client.

The game client sends:

```js
auth: token ? { token } : {}
```

but the backend does not validate it at connection time.

### Fix

Add Socket.IO authentication:

```text
client -> JWT
       -> verify JWT
       -> load user
       -> reject blocked user
       -> socket.user = user
```

Reject invalid tokens.

For public game state, decide explicitly whether unauthenticated connections are allowed.

For private events such as:

- wallet updates
- personal bet settlement
- personal balance

emit only to the authenticated user's room:

```text
user:<userId>
```

Never broadcast another user's wallet information.

---

# P0.6 Current 7 Up Down round state is not truly server-authoritative for clients

### Problem

`GET /api/games/7updown/current-round` returns:

- roundId
- gameId
- status
- serverSeedHash
- createdAt

It does not provide a reliable server-side countdown/deadline.

The frontend therefore defaults to:

```js
15
```

in `GameEngine.handleRoundCreated()`.

### Result

Different devices can show different countdowns because they use local timers.

### Fix

Backend must return:

```json
{
  "roundId": "...",
  "status": "BETTING_OPEN",
  "serverTime": "...",
  "bettingClosesAt": "...",
  "timeRemainingMs": 12345
}
```

The client calculates display time from the server timestamp/deadline.

Socket events must also include the absolute deadline.

---

# P0.7 Scheduler timing is fragile

### File

`seven_up_down.scheduler.js`

Current implementation uses:

- 15 sec betting
- 2 sec animation
- 3 sec pause
- 22 sec `setInterval`

The actual cycle duration depends on DB latency and settlement time.

Using a fixed `setInterval` is fragile.

### Fix

Use a recursive state-machine loop:

```text
load/recover round
        ↓
OPEN
        ↓
wait until bettingClosesAt
        ↓
CLOSE
        ↓
RESULT
        ↓
SETTLE
        ↓
create next round
        ↓
repeat
```

Do not schedule the next cycle from a fixed 22-second interval.

---

# P0.8 Multi-instance game engine is unsafe

### Problem

The engine stores:

```js
this.currentRound
this.roundCounter
```

in process memory.

If two backend instances run:

```text
Instance A -> creates round
Instance B -> creates round
```

both can believe they are the game authority.

### Fix

Use PostgreSQL/Redis distributed locking.

Recommended:

```text
game-engine-lock:seven_up_down
```

Only one worker is allowed to advance a game at a time.

Also derive round numbers from PostgreSQL instead of a process-local:

```js
this.roundCounter++
```

Use a DB sequence or atomic transaction.

---

# P0.9 Dragon Tiger and Crush are NOT implemented as live games

### Database currently contains:

```text
dragon_tiger -> COMING_SOON
crush        -> COMING_SOON
```

Only 7 Up Down has an actual backend engine/scheduler.

There are no corresponding backend engines/controllers/repositories for Dragon Tiger or Crush.

### Important

Changing Admin Panel status from:

```text
COMING_SOON -> LIVE
```

does NOT implement the game.

The current admin toggle can make a catalog entry appear LIVE even though there is no engine behind it.

### Fix

Create independent engines:

```text
games/
├── seven-up-down/
├── dragon-tiger/
└── crush/
```

Each game needs:

```text
engine
scheduler/worker
repository
controller
round state
bet validation
settlement
recovery
Socket events
tests
```

Then create a central GameManager:

```text
GameManager
├── SevenUpDownWorker
├── DragonTigerWorker
└── CrushWorker
```

Each worker must be independently restartable.

---

# P0.10 Admin "LIVE" toggle must not pretend an engine exists

### File

`backend/src/admin/admin_games.controller.js`

Current toggle only changes:

```text
games.status
```

### Fix

Before allowing:

```text
LIVE
```

verify:

```text
engine registered
scheduler healthy
required configuration present
game assets available
```

Recommended game states:

```text
DISABLED
STARTING
LIVE
PAUSED
DEGRADED
STOPPING
```

Admin should not be able to mark an unimplemented game LIVE.

---

# P0.11 Admin authentication is insecure for production

### Current design

Admin UI stores the admin secret in:

```js
localStorage
```

and sends:

```http
X-Admin-Secret: <secret>
```

on every request.

### Risks

- Secret is accessible to JavaScript.
- XSS can steal it.
- Browser history/devtools extensions/etc. can expose it.
- Secret is effectively a master password.
- No proper admin user/session lifecycle.
- No login/logout session management.
- No granular roles.

### Fix

Implement:

```text
POST /api/admin/auth/login
```

with admin credentials.

Issue short-lived admin session/JWT.

Prefer:

```text
HttpOnly
Secure
SameSite
```

cookie-based session.

Add:

```text
logout
session expiry
session revocation
failed-login rate limiting
audit log
role/permission checks
```

Keep `X-Admin-Secret` only as an emergency server-side break-glass mechanism, not the normal browser authentication method.

---

# P0.12 Admin role system is too weak

Current JWT check is essentially:

```js
decoded.isAdmin
```

but the normal auth JWT created in `auth.controller.js` does not establish a real admin account system.

### Fix

Create an admin table:

```text
admins
- id
- username
- password_hash
- role
- is_active
- created_at
- last_login_at
```

Roles:

```text
SUPER_ADMIN
FINANCE_ADMIN
GAME_ADMIN
SUPPORT_ADMIN
VIEWER
```

Enforce permissions server-side.

Example:

```text
FINANCE_ADMIN
  -> deposits
  -> withdrawals
  -> balance adjustments

GAME_ADMIN
  -> games
  -> rounds
  -> game configuration

SUPPORT_ADMIN
  -> users
  -> blocks
  -> support actions
```

---

# P0.13 Admin manual balance adjustment is not safely idempotent

### File

`backend/src/users/admin_user.controller.js`

Current idempotency key is generated from:

```text
admin + user + Date.now()
```

If the request succeeds but the browser loses the response, retrying creates a new idempotency key and can credit/debit again.

### Fix

Require a client-generated immutable operation ID.

Example:

```text
admin adjustment request ID
```

Store it with a unique constraint.

Retrying the same operation must return the original result.

---

# P0.14 Financial operations need strict fail-closed behaviour everywhere

The wallet service is much better than the old fake-success pattern because PostgreSQL transactions are used, but the overall application still has silent fallbacks in UI/service layers.

For money-related operations:

```text
DB failure != success
```

Never return:

```text
success
balance 0
```

when the DB failed.

Every financial API must return an explicit failure:

```text
503 SERVICE_UNAVAILABLE
```

when the authoritative financial DB is unavailable.

---

# P1 — HIGH PRIORITY BUGS

## P1.1 Flutter API service silently converts backend errors into null

### File

`lib/services/api_service.dart`

Examples:

```dart
catch (_) { return null; }
```

This exists for:

- profile
- onboarding
- games
- deposit
- withdrawal
- transactions
- banners
- bet history

### Result

Real backend failures become indistinguishable from:

```text
no data
```

This makes debugging and UI behaviour unreliable.

### Fix

For financial/auth operations:

- preserve `ApiException`
- display error code/message
- retry only safe GET requests
- never silently return null

---

# P1.2 `joinGame()` is a fake success

### File

`lib/services/api_service.dart`

Current implementation:

```dart
static Future<bool> joinGame(...) async {
  return true;
}
```

This is a real bug.

### Fix

Remove this method or connect it to a real backend endpoint.

For live betting games, the actual bet API must perform:

```text
validate round
validate game
validate status
validate stake
validate user
validate wallet
atomic debit
create bet
return authoritative wallet
```

---

# P1.3 Game API response parsing is inconsistent

`ApiClient` already unwraps successful responses:

```dart
return jsonBody['data'];
```

But several API wrappers still expect another:

```text
data
```

layer.

Example:

```dart
GameApi.getCurrent7UpDownRound()
```

checks for `res['data']`, although `ApiClient` normally returns the `data` object already.

### Fix

Choose one contract:

```text
ApiClient = unwraps envelope
Feature APIs = consume data directly
```

or:

```text
ApiClient = returns full envelope
Feature APIs = unwrap manually
```

Do not mix both.

Recommended: keep unwrapping in `ApiClient`.

---

# P1.4 Game frontend asset and game catalog IDs are inconsistent

Database:

```text
seven_up_down
dragon_tiger
crush
```

Flutter fallback uses:

```text
classic_dice
double
7updown
mines
```

Some fallback entries point to:

```text
/games/seven_up_down/index.html
```

for unrelated games.

### Result

A card can visually represent one game while launching another game.

### Fix

Create one canonical game ID registry.

Example:

```text
seven_up_down
dragon_tiger
crush
```

Every layer must use the same ID:

```text
DB
backend
Flutter
WebView
assets
admin
Socket.IO
```

---

# P1.5 Dashboard has fake fallback user/profile data

### File

`lib/services/dashboard_sync_manager.dart`

The fallback contains hardcoded profile-like data such as:

- fake username
- fake phone number
- fake balance
- fake referrals
- fake online count

This is dangerous for a real-money application.

### Fix

Only use static UI placeholders when no authenticated user exists.

Never populate authenticated user state with fake financial/profile data.

If server unavailable:

```text
show cached non-financial UI
mark data as stale
do not invent wallet/user values
```

Wallet should be:

```text
unknown / unavailable
```

not:

```text
₹0
```

unless the server actually returned ₹0.

---

# P1.6 Online user count is fake

### File

`backend/src/server/app.js`

Current:

```js
const baseOnline = 89214 + realtimeCount
```

and other places use:

```text
89214
89156
```

### Fix

If the UI needs a live count:

```text
Socket.IO presence
+
Redis distributed presence
```

For multiple instances:

```text
presence:user:<userId>
```

with TTL/heartbeat.

Do not fabricate an online count.

---

# P1.7 Banners endpoint returns success when DB fails

### File

`backend/src/server/app.js`

On DB error:

```js
return res.status(200).json({
  status: 'success',
  data: [...]
});
```

### Problem

The client cannot distinguish:

```text
real DB promotions
```

from:

```text
database failure
```

### Fix

Return:

```text
503
```

for DB-backed data failure.

If a static emergency banner is desired, mark it explicitly:

```json
{
  "source": "static_fallback",
  "stale": true
}
```

Do not present it as live DB data.

---

# P1.8 Dashboard games endpoint swallows DB failure

### File

`backend/src/users/user.controller.js`

The games query has:

```js
catch (_) {}
```

and then returns a successful response.

### Fix

Do not hide this error.

Return an explicit degraded response or 503.

---

# P1.9 Socket client uses CDN fallback for production game client

### File

`backend/public/games/seven_up_down/index.html`

It tries:

```text
/socket.io/socket.io.js
```

and then:

```text
https://cdn.socket.io/...
```

### Problem

Game operation becomes dependent on a third-party CDN.

### Fix

Bundle and serve the exact Socket.IO client version used by backend.

Avoid runtime CDN dependency for the money-game client.

---

# P1.10 Game socket client can duplicate listeners

### File

`SocketClient.js`

`connect()` can be called again while listeners remain queued.

`GameSocket.init()` also registers listeners every time it is initialized.

### Fix

Make connection lifecycle singleton-safe:

```text
connect()
disconnect()
destroy()
```

and prevent duplicate listener registration.

---

# P1.11 Socket.IO reconnect needs state resynchronization

A reconnecting client may miss:

```text
ROUND_OPEN
BETTING_CLOSED
RESULT
SETTLED
```

events.

### Fix

After every reconnect:

```text
GET current round
GET server time/deadline
GET current user bets
GET current balance
```

Then resume realtime events.

Never rely only on Socket.IO events for authoritative state.

---

# P1.12 Current round recovery is incomplete

`recoverActiveRoundFromDb()` restores:

```text
roundId
status
dice
result fields
```

but does not reconstruct all timing/deadline information.

### Fix

Persist:

```text
betting_opened_at
betting_closes_at
result_at
settlement_started_at
settled_at
```

and reconstruct the state machine from DB after restart.

---

# P1.13 Round recovery can incorrectly resume an old round

The recovery query uses:

```text
getRecentRoundsFromDb(1)
```

and then accepts several non-final states.

It must verify that the round is actually recoverable based on its timestamps.

Example:

```text
BETTING_OPEN but bettingClosesAt is already past
```

must not reopen betting.

Instead:

```text
close -> result -> settle
```

according to deterministic recovery rules.

---

# P1.14 Seed handling needs stronger provable-fairness design

The server stores:

```text
server_seed
server_seed_hash
```

but the complete commitment/reveal protocol should be explicit.

For every round:

```text
serverSeed
serverSeedHash = SHA256(serverSeed)
```

Commit hash before betting.

After result:

```text
reveal serverSeed
```

and provide enough information for the client/auditor to reproduce the result.

Do not reveal `serverSeed` before betting closes.

---

# P1.15 Bet API should verify the requested round ID

The frontend sends:

```text
roundId
```

The engine currently uses its process-local:

```text
currentRound
```

and the supplied round ID is not the primary authoritative round selection.

### Fix

The server must validate:

```text
requested roundId == current authoritative open round
```

before accepting a bet.

If not:

```text
409 ROUND_CHANGED
```

Return the new current round.

---

# P1.16 Bet submission loop can partially succeed

`POST /7updown/bets` accepts an array and loops:

```js
for (const betItem of betList)
```

If bet 1 succeeds and bet 2 fails, the request can return an error after partial success.

### Fix

Either:

1. Treat every bet as an independent operation and return per-item results, or
2. Wrap the entire multi-bet request in one DB transaction.

For a betting slip, option 2 is usually safer.

---

# P1.17 Admin game configuration validation is weak

Current configuration accepts:

```text
entryFee
minStake
maxStake
```

but does not sufficiently validate:

```text
positive integer paise
min <= max
entryFee within min/max
reasonable upper limits
```

### Fix

Validate server-side in paise.

Reject floating precision problems.

---

# P1.18 Admin routes lack rate limiting

Especially important for:

```text
admin login
admin financial operations
```

### Fix

Add rate limiting for:

```text
/admin/auth/*
/admin/*/confirm
/admin/*/reject
/admin/users/*/adjust-balance
```

---

# P1.19 CORS is too permissive by default

`config.corsOrigin` defaults to:

```text
*
```

### Fix

Production must require an explicit allowlist.

Example:

```text
https://admin.example.com
https://app.example.com
```

Never use `*` in production for authenticated/admin APIs.

---

# P1.20 Production config has insecure development fallbacks

`env.js` contains defaults for:

```text
DB password
JWT secret
admin secret
Loggin app key
payment UPI
```

### Fix

In production, fail startup unless required secrets are explicitly configured.

Validate:

```text
DATABASE_URL / DB config
JWT_SECRET
ADMIN auth config
LOGGIN_APP_KEY
PAYMENT_UPI_ID
Telegram config if enabled
```

Never use dev secrets in production.

---

# P1.21 JWT session persistence is incomplete

The DB contains:

```text
user_sessions
```

but the application JWT is generated directly and auth middleware verifies the JWT without checking whether the session has been revoked.

### Fix

Use either:

### Option A

Stateless JWT with short expiry + refresh token.

### Option B

JWT includes session ID and every authenticated request validates the session.

For a financial app, use short-lived access tokens + revocable refresh/session records.

---

# P1.22 Login does not clearly distinguish blocked/deleted users during token issuance

The auth flow:

```text
verified phone
-> find/create user
-> issue JWT
```

must ensure a blocked existing account cannot simply be treated like a normal login.

### Fix

After finding user:

```text
if blocked -> reject login
```

before issuing the application token.

---

# P2 — ADMIN PANEL FUNCTIONAL GAPS

## Dashboard

Need:

- DB health
- Redis health
- Socket health
- game worker health
- current round
- pending deposits
- pending withdrawals
- failed settlements
- stuck rounds
- last successful settlement
- Telegram status
- active sessions
- deployment version

---

## Users

Current features are useful but add:

- exact wallet breakdown
- block/unblock
- KYC
- session revoke
- login history
- transaction ledger
- bet history
- responsible audit trail
- account status
- last active
- risk flags

Never allow support users to change balances unless explicitly authorized.

---

## Deposits

Must show:

```text
deposit ID
user
amount
UTR
payment method
created time
UTR submitted time
status
admin
admin note
```

Actions:

```text
confirm
reject
```

Confirmation must be atomic and idempotent.

---

## Withdrawals

Must show:

```text
withdrawal ID
user
amount
UPI
status
requested time
processing time
completed time
admin
admin note
```

Flow:

```text
PENDING
  ↓
PROCESSING
  ↓
SUCCESS
```

or:

```text
PENDING/PROCESSING
  ↓
REJECTED
  ↓
reserved funds released
```

No double finalization.

---

## Games

Admin needs:

```text
status
worker status
current round
round age
last result
bets count
total stake
settlement status
configuration
```

Buttons:

```text
Start
Pause
Resume
Disable
```

Do not allow manual result manipulation through normal admin UI.

---

## Promotions

Current CRUD is acceptable structurally, but add:

- valid date range validation
- amount validation
- activation conflict checks
- audit log
- preview
- explicit priority

---

## Notifications

Replace the current fake Telegram page with:

```text
Telegram status
Bot configured
Chat configured
Last successful notification
Last failed notification
Test message
```

Bot token must never be returned to frontend.

---

# P2 — DATABASE IMPROVEMENTS

Add indexes for common queries:

```text
game_rounds(game_id, status, created_at DESC)
bets(round_id, created_at DESC)
bets(user_id, created_at DESC)
wallet_ledger(user_id, created_at DESC)
deposits(status, created_at DESC)
withdrawals(status, created_at DESC)
```

Add constraints where possible.

Add timestamps for all game lifecycle phases.

Add:

```text
settlement_attempts
```

or equivalent retry metadata.

---

# P2 — WALLET SAFETY

The current financial service correctly uses PostgreSQL row locking in the main wallet operations.

Keep:

```text
SELECT ... FOR UPDATE
```

and:

```text
BEGIN
COMMIT
ROLLBACK
```

But add:

## Double-spend tests

Run concurrent:

```text
20 bets x same user
```

with balance smaller than total requested stake.

Expected:

```text
Only affordable bets succeed.
Balance never becomes negative.
```

## Double withdrawal tests

Two simultaneous withdrawals must not reserve the same funds.

## Double admin confirmation

Two admins clicking confirm at the same time must produce one financial effect.

## Double deposit confirmation

Two confirmations must produce one wallet credit.

---

# P2 — OBSERVABILITY

Add structured fields to logs:

```text
requestId
userId
adminId
gameId
roundId
betId
depositId
withdrawalId
idempotencyKey
```

Never log:

```text
JWT
admin secret
Loggin token
Telegram bot token
UPI/private credentials
```

Add metrics:

```text
round_duration
bet_latency
settlement_latency
settlement_failures
wallet_transaction_failures
socket_connections
active_game_workers
telegram_failures
login_failures
```

---

# REQUIRED ARCHITECTURE AFTER FIX

```text
                    ┌─────────────────────┐
                    │      Flutter App     │
                    └──────────┬──────────┘
                               │ HTTPS
                               ▼
                    ┌─────────────────────┐
                    │     API Backend     │
                    └──────┬────────┬─────┘
                           │        │
                  ┌────────▼───┐ ┌──▼───────────┐
                  │ PostgreSQL │ │    Redis     │
                  │ Authoritative│ │ realtime/lock│
                  └────────────┘ └──────────────┘
                           ▲
                           │
              ┌────────────┴────────────┐
              │      Game Manager       │
              └──────┬──────┬──────┬────┘
                     │      │      │
              ┌──────▼─┐ ┌──▼────┐ ┌▼──────┐
              │7UpDown │ │Dragon │ │ Crush  │
              │ Worker │ │Tiger  │ │ Worker │
              └────────┘ │Worker │ └────────┘
                         └───────┘
                              │
                         Socket.IO
                              │
                              ▼
                         Game Clients

Admin Browser
      │
      ▼
Admin Auth Session
      │
      ▼
Admin API
      │
      ├── Finance
      ├── Users
      ├── Games
      ├── Reports
      └── Notifications
                 │
                 ▼
              Telegram
```

---

# CANONICAL GAME STATE MACHINE

Every live game must implement:

```text
CREATED
   ↓
BETTING_OPEN
   ↓
BETTING_CLOSED
   ↓
RESULT
   ↓
SETTLING
   ↓
SETTLED
   ↓
NEXT ROUND
```

Never allow:

```text
SETTLED -> BETTING_OPEN
```

Never allow bets after:

```text
BETTING_CLOSED
```

---

# CANONICAL REALTIME PROTOCOL

Use these events:

```text
GAME_ROUND_CREATED
GAME_BETTING_OPEN
GAME_BETTING_CLOSED
GAME_RESULT
GAME_ROUND_SETTLED
GAME_BET_ACCEPTED
GAME_BET_REJECTED
GAME_WALLET_UPDATED
```

Payload:

```json
{
  "version": 1,
  "gameId": "seven_up_down",
  "roundId": "7ud_r_...",
  "serverTime": "2026-09-08T10:00:00.000Z",
  "sequence": 101,
  "payload": {}
}
```

Client must resync after reconnect.

---

# LOGIN FLOW TO IMPLEMENT

```text
Flutter
  │
  ├── create-token
  │
  ▼
Backend
  │
  ├── create Loggin token
  ├── store session in Redis
  │
  ▼
Flutter opens WhatsApp
  │
  ▼
Loggin
  │
  ▼
Backend verification worker
  │
  ├── VERIFIED
  │
  ▼
PostgreSQL transaction
  ├── find/create user
  ├── ensure wallet
  ├── check blocked
  └── create session
  │
  ▼
Flutter receives short-lived access token
```

---

# TELEGRAM FLOW TO IMPLEMENT

```text
Deposit Created
      ↓
DB COMMIT
      ↓
Notification Queue
      ↓
Telegram Service
      ↓
Admin Telegram Chat
```

Same for:

```text
Withdrawal Requested
Large Bet
Deposit Confirmed
Withdrawal Confirmed
System Failure
Game Worker Failure
Settlement Failure
```

---

# TEST PLAN

Before production, add automated tests for:

## Authentication

- create token
- expired token
- invalid token
- duplicate verification
- concurrent verification
- blocked user
- session revocation
- JWT expiry

## Telegram

- configured
- unconfigured
- timeout
- Telegram 4xx
- Telegram 5xx
- notification retry
- notification failure does not rollback money

## Games

For each game:

- create round
- open betting
- reject late bet
- accept valid bet
- insufficient funds
- duplicate bet
- close betting
- result
- settlement
- duplicate settlement
- crash recovery
- server restart recovery
- concurrent worker prevention

## Wallet

- concurrent debit
- concurrent withdrawal
- deposit confirmation twice
- withdrawal confirmation twice
- rejection refund once
- admin adjustment retry
- DB failure
- rollback verification

## Admin

- unauthorized
- wrong role
- expired session
- rate limit
- audit logging
- financial permission enforcement

---

# ACCEPTANCE CRITERIA

Do not mark the task complete until all of these are true:

- [ ] Login works reliably without concurrent Loggin waits.
- [ ] Loggin session survives backend instance changes/restarts through Redis.
- [ ] Blocked users cannot authenticate.
- [ ] Telegram notifications actually send.
- [ ] Telegram failure never changes money transaction result.
- [ ] Admin has proper authenticated session.
- [ ] Admin secret is not stored in browser localStorage.
- [ ] Admin roles/permissions work.
- [ ] Manual balance adjustment is idempotent.
- [ ] 7 Up Down realtime event names match client/server.
- [ ] Socket.IO JWT authentication is enabled.
- [ ] Reconnect performs authoritative state resync.
- [ ] Countdown is server-time/deadline based.
- [ ] Game scheduler is state-machine based, not fixed-interval based.
- [ ] Game worker has distributed lock.
- [ ] Round number is DB-authoritative.
- [ ] Dragon Tiger has its own engine/scheduler/API.
- [ ] Crush has its own engine/scheduler/API.
- [ ] Admin cannot mark an unimplemented game LIVE.
- [ ] Flutter has no fake `joinGame()`.
- [ ] Flutter does not silently hide financial API errors.
- [ ] Fake balances/profile fallbacks are removed.
- [ ] Fake online count is removed.
- [ ] DB failure never returns fake successful financial/data responses.
- [ ] Production secrets have no insecure defaults.
- [ ] CORS is explicit in production.
- [ ] Test suite passes after clean dependency installation.
- [ ] Concurrency tests pass.
- [ ] Restart/recovery tests pass.
- [ ] Full deposit -> wallet -> bet -> win -> withdrawal flow passes.

---

# PRIORITY ORDER FOR THE AI AGENT

Implement in this exact order:

## Phase 1 — Security & Auth

1. Fix Loggin verification architecture.
2. Move Loggin sessions to Redis.
3. Add blocked-user login check.
4. Add proper admin authentication/session.
5. Add admin roles.
6. Add rate limiting.
7. Fix production secret validation.
8. Fix CORS.

## Phase 2 — Financial Safety

9. Make every financial operation fail closed.
10. Make admin adjustments idempotent.
11. Add concurrency tests.
12. Verify deposit/withdrawal idempotency.
13. Verify transaction rollback behaviour.

## Phase 3 — Realtime

14. Add authenticated Socket.IO.
15. Standardize event protocol.
16. Add server-time/deadline round synchronization.
17. Add reconnect resync.
18. Add Redis presence if multiple instances are used.

## Phase 4 — Game Engine

19. Refactor 7 Up Down into a proper worker/state machine.
20. Add distributed game lock.
21. Add DB-authoritative round sequencing.
22. Add crash/restart recovery.
23. Implement Dragon Tiger.
24. Implement Crush.
25. Register all game workers in GameManager.

## Phase 5 — Admin

26. Fix game status/worker health.
27. Add round monitoring.
28. Add settlement monitoring.
29. Fix finance pages.
30. Add Telegram status/test notification.

## Phase 6 — Flutter

31. Remove fake `joinGame()`.
32. Normalize API response contracts.
33. Stop swallowing API errors.
34. Remove fake authenticated fallback data.
35. Fix game ID/game URL mappings.
36. Add realtime game resync.

## Phase 7 — QA

37. Install clean dependencies.
38. Run all tests.
39. Add concurrency tests.
40. Add restart/recovery tests.
41. Run full E2E money flow.
42. Verify all three live games simultaneously.
43. Verify admin actions while all games are running.
44. Verify Telegram alerts.
45. Final production security audit.

---

# FINAL VERDICT

Current project has a **good starting financial transaction structure**, but it is **not production-ready for three continuously live real-money games**.

The biggest blockers are:

1. **Login/Loggin verification architecture**
2. **Telegram is not implemented**
3. **Socket event mismatch**
4. **Unauthenticated Socket.IO**
5. **7 Up Down scheduler/state architecture**
6. **Dragon Tiger and Crush do not actually have backend game engines**
7. **Admin authentication relies on a browser-stored master secret**
8. **Fake/silent fallbacks remain in Flutter/backend**
9. **Fake online counts/profile data remain**
10. **Flutter contains a fake `joinGame() -> true`**
11. **Multi-instance/restart safety is incomplete**
12. **Tests cannot currently be considered green**

Fix these P0 items before enabling real-money Dragon Tiger, 7 Up Down and Crush simultaneously.
