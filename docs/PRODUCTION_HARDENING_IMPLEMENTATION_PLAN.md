# 999xGame — Production Hardening Implementation Plan

## Goal

Bring the Flutter + Node/PostgreSQL/Redis platform to a production-safe state with one authoritative money model, server-authoritative game state, secure authentication, deterministic recovery, distributed-worker safety, and automated regression coverage.

## P0 — Must fix before real-money production

1. **Crush information disclosure**
   - Never expose `crashPoint` or `serverSeed` during CREATED/BETTING_OPEN/FLYING.
   - Public round serialization must whitelist fields.
   - Reveal `crashPoint` + `serverSeed` only after CRASHED/SETTLED.
   - Add regression tests for REST and realtime payloads.

2. **Wallet bucket integrity**
   - Treat `available_balance` as the spendable aggregate.
   - Debit component buckets deterministically (deposit -> winnings -> rewards).
   - Keep bucket totals and aggregate balance consistent.
   - Add reconciliation query/job and fail closed on inconsistent legacy wallets.

3. **Game payout specification**
   - Write explicit payout/RTP rules for every game.
   - Verify probabilities, gross payout and house edge with tests.
   - No payout constant may be changed without a regression test.

4. **Settlement invariants**
   - Every accepted bet must reach exactly one terminal state.
   - Every monetary credit/debit must have an idempotent ledger entry.
   - Round terminal state and settlement must be atomic.

## P1 — Security and distributed production correctness

5. **Bet idempotency ownership**
   - Scope idempotency keys to user + operation/game.
   - Never return another user's bet on a key collision.
   - Do not derive idempotency from business fields such as bet type + stake; repeated identical bets must remain possible.

6. **Authentication lifecycle**
   - Keep one clear source of truth for user authentication.
   - Move mobile token storage to secure platform storage.
   - Add token/session revocation for logout and compromise.
   - Shorten/review admin token lifetime and add server-side revocation.
   - Add CSRF protection for cookie-authenticated admin mutations.

7. **Secrets/configuration**
   - Production must fail closed when secrets are missing or weak.
   - Support `REDIS_URL`/TLS consistently.
   - Enforce PostgreSQL certificate verification in production.
   - Keep break-glass disabled by default and strongly audited when enabled.

8. **Distributed rate limiting**
   - Move authentication/bet/cashout/withdrawal rate limits to Redis-backed storage.
   - Confirm behavior with multiple application instances.

9. **Database migrations**
   - Migration runner must fail if the migration directory is missing/empty in production.
   - Record migration checksums and detect modified applied migrations.
   - Keep schema.sql as a generated/reference artifact, not a competing migration source.

10. **Worker leadership/recovery**
    - Verify leader lock ownership, lease expiry and failover under process termination.
    - Test each game through restart at every lifecycle state.
    - Never start a second round while a previous non-terminal round exists.

## P2 — Client architecture and maintainability

11. Remove duplicate API repositories/services and define typed response models.
12. Consolidate dashboard/wallet state so money is read from one authoritative API state.
13. Remove duplicate backend health polling.
14. Replace boolean navigation state with a proper route/state model.
15. Validate DOB from an actual date rather than deriving January 1 from an age.
16. Add API contract tests shared by backend and Flutter expectations.

## Test matrix

### Wallet
- deposit -> available/deposit bucket
- bet debit -> aggregate + correct bucket decrease
- win -> winnings bucket increase
- withdrawal reserve -> available/reserved movement
- withdrawal release -> exact reversal
- withdrawal finalize -> reserved decrease only
- concurrent debit -> never negative
- duplicate request -> one ledger mutation
- idempotency key collision across users -> 409

### Games
- 7 Up Down all 36 dice outcomes map correctly
- Dragon Tiger all card-value/tie outcomes map correctly
- Crush pre-crash payload contains no secret result
- manual cashout at/after crash is rejected
- auto-cashout executes exactly once
- crash settlement executes exactly once
- restart recovery refunds or settles deterministically

### Auth/admin
- invalid/expired/revoked token
- blocked user cannot play or transact
- admin role boundaries
- cookie CSRF rejection
- logout invalidates admin session
- break-glass disabled by default

### Deployment
- fresh database migration
- existing database migration
- modified migration detection
- missing migration directory fails production startup
- Redis outage behavior
- PostgreSQL outage/readiness behavior
- two application instances with one game leader
- leader process killed mid-round

## Release gates

A production release is allowed only when:

- P0 tests pass.
- Wallet reconciliation reports zero unexplained differences.
- No secret is exposed by public game-state endpoints/events.
- Migration verification passes.
- Backend and Flutter CI are green.
- Multi-instance worker failover test passes.
- A smoke test covers login -> deposit -> bet -> result -> wallet -> withdrawal.
