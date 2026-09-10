review code bug and problem
Summary
Fix the money-path correctness bugs first. Make admin balance adjustment atomic and idempotent. Align the withdrawal path with the deposit path.
Enforce idempotency keys consistently across all game bet routes. This removes the double-debit risk.
Fix the silent reliability bugs in the realtime service, the migration runner, and the DB error contract.
Close admin least-privilege and input-validation gaps. Resolve the confirmed Flutter client duplication and navigation bugs.
Design choices
1. Scope of bugs to fix for this review ticket
Fix only the confirmed backend correctness bugs that can cause money loss, double-spend, or a broken transaction boundary.
Fix all confirmed backend bugs plus the highest-value Flutter client cleanups.
Fix every documented item, including large P2 client refactors.
Selected: Fix all confirmed backend bugs plus the highest-value Flutter client cleanups.

Rationale: This option resolves the real correctness risks and the confirmed client bugs. It does not pull in large speculative refactors that go beyond a review-fix scope.

Implementation steps
Phase 1: Wallet and Financial Transaction Correctness
This phase fixes the money-path bugs. These are the highest-risk problems. They can cause partial state, double processing, or a broken transaction boundary. The goal is to make every admin money mutation atomic and idempotent. The goal also aligns the withdrawal path with the deposit path.

Make admin balance adjustment transactionally safe: The admin balance adjustment endpoint calls financialService.creditWallet/debitWallet with a raw client. It never issues BEGIN/COMMIT/ROLLBACK. This defeats the SELECT ... FOR UPDATE row lock. It can leave partial state on error.

Update backend/src/users/admin_user.controller.js POST /:userId/adjust-balance to open an explicit transaction on its client before calling financialService. Commit on success. Roll back on error.

Follow the pattern used in backend/src/wallet/deposit.repository.js and the game repositories. In this pattern, the caller issues client.query('BEGIN') before calling financial.service.js, and issues COMMIT/ROLLBACK around it.

Confirm the finally block still releases the client.

Fix the admin adjustment idempotency key collision: The fallback idempotency key admin_adj_${adminId}_${userId}_${Math.floor(Date.now()/60000)} collapses to the same value for the same admin and user within a 60-second window. This can silently block a second legitimate adjustment.

Update backend/src/users/admin_user.controller.js to derive the fallback key from a unique value per request instead of a coarse per-minute timestamp.

Prefer requiring a client-supplied idempotency key, validated with validateIdempotencyKey from backend/src/utils/validation.js. Fall back to a unique generated key only when the client supplies no key.

Align withdrawal confirm/reject with the deposit duplicate handling: confirmWithdrawalByAdmin and rejectWithdrawalByAdmin never check result.duplicate from finalizeReservedFunds/releaseReservedFunds. If that branch runs, later code reads result.wallet (undefined) and throws after COMMIT already ran.

Update backend/src/wallet/withdrawal.repository.js to check the duplicate flag on the financial.service.js result before reading result.wallet. Match the guard in confirmDepositByAdmin.

Return a stable duplicate response instead of dereferencing an undefined wallet.

Remove the dead addCash() function with a broken idempotency key: wallet.repository.js addCash() builds a non-deterministic idempotency key (idemp_dep_${userId}_${Date.now()}). This key gives no protection. The function is dead code but remains exported as a reuse trap.

Delete addCash() from backend/src/wallet/wallet.repository.js. Remove its export.

Confirm no route or controller references it before removal.

Instructions for the coding agent
Implement Phase 1 to make admin money mutations atomic and idempotent, and to align the withdrawal path with the deposit path.

In backend/src/users/admin_user.controller.js, in the POST /:userId/adjust-balance handler: open an explicit transaction on the client (BEGIN) before calling financialService.creditWallet/debitWallet, COMMIT on success, ROLLBACK on error, and confirm the finally block still releases the client. Follow the transaction pattern used in backend/src/wallet/deposit.repository.js and the game repositories.
In the same controller, fix the fallback idempotency key. Replace the per-minute key admin_adj_${adminId}_${userId}_${Math.floor(Date.now()/60000)} with a unique per-request value. Prefer requiring a client-supplied key validated via validateIdempotencyKey from backend/src/utils/validation.js, and only generate a fallback unique key when the client supplies none.
In backend/src/wallet/withdrawal.repository.js, update confirmWithdrawalByAdmin and rejectWithdrawalByAdmin to check the duplicate flag on the result returned by finalizeReservedFunds/releaseReservedFunds before reading result.wallet. Match the guard used in confirmDepositByAdmin, and return a stable duplicate response instead of dereferencing an undefined wallet.
In backend/src/wallet/wallet.repository.js, delete the addCash() function and remove its export. First confirm no route or controller references it.
Phase 2: Game Bet Idempotency Consistency
This phase removes the double-debit risk on game bets. Seven Up Down requires an idempotency key. Dragon Tiger and Crush treat it as optional. Dragon Tiger does not substitute a generated key back into the call. A client retry after a network timeout can debit the wallet twice.

Enforce idempotency keys consistently across all game bet routes: Make Dragon Tiger and Crush bet placement require and use an idempotency key, matching Seven Up Down.

Update backend/src/games/game.controller.js so the Dragon Tiger and Crush bet routes call validation.validateIdempotencyKey(idempotencyKey, { required: true }) and pass the validated key into the repository call.

Confirm the generated or validated key is actually forwarded to placeBet*InDb for Dragon Tiger, not dropped.

Update backend/src/games/dragon-tiger/dragon_tiger.repository.js and backend/src/games/crush/crush.repository.js to require the key in placeBetInDb, matching the guard in backend/src/games/seven-up-down/game.repository.js.

Instructions for the coding agent
Implement Phase 2 to remove the double-debit risk on game bets by enforcing idempotency keys consistently across Dragon Tiger, Crush, and Seven Up Down.

In backend/src/games/game.controller.js, update the Dragon Tiger and Crush bet routes to call validation.validateIdempotencyKey(idempotencyKey, { required: true }) and pass the validated key into the repository call.
For Dragon Tiger, confirm the generated or validated key is actually forwarded to placeBet*InDb and is not dropped.
In backend/src/games/dragon-tiger/dragon_tiger.repository.js and backend/src/games/crush/crush.repository.js, require the idempotency key inside placeBetInDb, matching the existing guard in backend/src/games/seven-up-down/game.repository.js.
Phase 3: Realtime and Infrastructure Reliability
This phase fixes reliability bugs that cause silent, hard-to-detect failures in production. These bugs do not corrupt money. They cause lost realtime events, unsafe environment behavior, and an inconsistent failure contract.

Fix the realtime service reconnect handling: realtime.service.js sets ready = true only once, after the first connect. After any transient Redis error, ready stays false forever. Cross-instance event fan-out silently degrades to local-only emit.

Update backend/src/services/realtime.service.js to add connect/ready and end listeners on the publisher and subscriber clients, and reset ready accordingly.

Follow the pattern in backend/src/database/redis.js, which correctly tracks connection state across reconnects.

Confirm ready returns to true after a successful auto-reconnect.

Make the migration runner fail closed outside production too: migrate.js only treats an empty migrations directory as fatal when NODE_ENV === 'production'. A non-production deployment string (for example staging) can start with no schema.

Update backend/src/database/migrate.js so an empty migrations directory fails closed in any deployment environment, not only when NODE_ENV is exactly production.

Keep the existing checksum verification and advisory-lock behavior unchanged.

Make DB connection-error wrapping consistent: db.js query() rethrows raw driver errors on connection failure, while getClient() wraps them into a 503 DATABASE_UNAVAILABLE. This produces an inconsistent failure contract and a generic 500 instead of a 503.

Update backend/src/database/db.js so query() wraps connection-class errors with databaseUnavailableError, matching getClient().

Preserve the existing dbState.ready = false marking on connection errors.

Instructions for the coding agent
Implement Phase 3 to fix silent reliability failures in the realtime service, the migration runner, and the DB error contract.

In backend/src/services/realtime.service.js, add connect/ready and end listeners on both the publisher and subscriber clients, and reset the ready flag accordingly, instead of setting ready = true only once after the first connect. Follow the connection-state tracking pattern in backend/src/database/redis.js. Confirm ready returns to true after a successful auto-reconnect.
In backend/src/database/migrate.js, change the empty-migrations-directory check so it fails closed in any deployment environment, not only when NODE_ENV is exactly production. Keep the existing checksum verification and advisory-lock behavior unchanged.
In backend/src/database/db.js, update query() to wrap connection-class errors with databaseUnavailableError, matching the wrapping already done in getClient(). Preserve the existing dbState.ready = false marking on connection errors.
Phase 4: Admin Authorization and Input Validation Hardening
This phase closes least-privilege gaps and input-validation gaps in the admin and user layers. The review confirmed that some admin read endpoints expose financial and PII data to any admin role. The review also confirmed that several inputs are not validated.

Apply role checks to admin read endpoints: Several admin read routes only require adminMiddleware and expose balances, PII, financial summaries, reconciliation reports, and audit logs to any admin role. Writes are gated, but reads are not.

Update backend/src/admin/admin_reports.controller.js and backend/src/admin/admin_stats.controller.js to add requireRole(...) to their routes, consistent with the write routes in the same subsystem.

Update backend/src/admin/admin_games.controller.js to gate the bet-level and PII read routes (/:gameId/bets, /:gameId/rounds) with requireRole(...).

Update backend/src/users/admin_user.controller.js to gate GET / and GET /:userId with requireRole(...).

Add bounds to the reports day range parameter: admin_reports.controller.js /daily computes days with Math.min(..., 90) but no lower bound. As a result, days can be NaN or negative.

Update backend/src/admin/admin_reports.controller.js to clamp days with a lower bound (Math.max(1, ...)).

Prefer passing the value as a bound query parameter using make_interval instead of string interpolation.

Validate date of birth on the backend: The backend accepts dateOfBirth/date_of_birth and writes it to Postgres with no validation. A user can submit an invalid or future date during onboarding.

Add a date-of-birth validator to backend/src/utils/validation.js that validates an actual calendar date, rejects future dates, and enforces a plausible minimum age.

Update backend/src/users/user.controller.js complete-onboarding and backend/src/users/user.repository.js to validate dateOfBirth before persistence.

Validate admin promotion inputs: admin_promotions.controller.js POST / only checks title and type truthiness. It has no type whitelist, no length limits, and no validFrom <= validUntil check.

Update backend/src/admin/admin_promotions.controller.js to validate type against an allowed set, enforce length limits on text fields, and require validFrom <= validUntil.

Instructions for the coding agent
Implement Phase 4 to close admin least-privilege gaps and input-validation gaps.

Add requireRole(...) to admin read routes that currently only require adminMiddleware: in backend/src/admin/admin_reports.controller.js and backend/src/admin/admin_stats.controller.js, apply role checks consistent with the write routes in the same subsystem; in backend/src/admin/admin_games.controller.js, gate the bet-level and PII read routes (/:gameId/bets, /:gameId/rounds); in backend/src/users/admin_user.controller.js, gate GET / and GET /:userId.
In backend/src/admin/admin_reports.controller.js, in the /daily route, clamp the days value with a lower bound using Math.max(1, ...) in addition to the existing Math.min(..., 90) upper bound. Prefer passing the value as a bound query parameter using make_interval instead of string interpolation.
Add a date-of-birth validator to backend/src/utils/validation.js that validates an actual calendar date, rejects future dates, and enforces a plausible minimum age. Update backend/src/users/user.controller.js complete-onboarding and backend/src/users/user.repository.js to validate dateOfBirth/date_of_birth before persistence.
In backend/src/admin/admin_promotions.controller.js, in the POST / route, validate type against an allowed set, enforce length limits on text fields, and require validFrom <= validUntil, instead of only checking title and type truthiness.
Phase 5: Flutter Client Cleanups
This phase resolves the confirmed client bugs that cause inconsistent behavior. It removes duplicate API logic and replaces fragile boolean navigation. It keeps the scope to confirmed problems and avoids a full rewrite.

Consolidate duplicate API layers behind one implementation: Three overlapping API layers exist: ApiClient, ApiService, and the features/*/data/*_api.dart classes. The duplicated endpoint methods use divergent response-unwrapping logic. This logic can silently diverge.

Choose one canonical layer and route all callers through it. Prefer the features/*/data/*_api.dart typed classes on top of lib/core/api/api_client.dart.

Update lib/services/api_service.dart callers (for example getTransactions, getBetHistory, getGamesList) to delegate to the single canonical method so unwrap logic is defined once.

Confirm transactions_screen.dart and other screens all use the same method for the same logical call.

Replace boolean navigation state with a route/state model: lib/main.dart uses about nine mutually-exclusive boolean flags to emulate navigation. This approach is fragile and can show two active pages at once.

Update lib/main.dart to replace the boolean flags with a single active-page enum or a proper Navigator/route model.

Update the onTap and back-press handlers to set one state value instead of resetting several booleans.

Consolidate wallet balance to one authoritative source: wallet_screen.dart still exposes balance fields as constructor defaults, while dashboard_sync_manager.dart strips financial fields. This creates a split money-state path. realtime_sync_service.dart also fetches and discards a profile response purely to trigger a second refresh.

Update lib/screens/wallet_screen.dart to read balances from the single authoritative API state rather than constructor defaults.

Update lib/services/realtime_sync_service.dart to use the fetched authoritative profile state directly instead of discarding it and triggering a separate dashboard fetch.

Instructions for the coding agent
Implement Phase 5 to resolve confirmed Flutter client bugs by removing duplicate API logic, replacing fragile boolean navigation, and consolidating the wallet balance source.

Consolidate the three overlapping API layers (ApiClient, ApiService, and the features/*/data/*_api.dart classes) behind one canonical implementation. Prefer the features/*/data/*_api.dart typed classes built on top of lib/core/api/api_client.dart. Update lib/services/api_service.dart callers such as getTransactions, getBetHistory, and getGamesList to delegate to the single canonical method so response-unwrapping logic exists in one place. Confirm transactions_screen.dart and other screens use the same method for the same logical call.
In lib/main.dart, replace the roughly nine mutually-exclusive boolean navigation flags with a single active-page enum or a proper Navigator/route model. Update the onTap and back-press handlers to set one state value instead of resetting several booleans.
In lib/screens/wallet_screen.dart, read balances from the single authoritative API state rather than from constructor defaults. In lib/services/realtime_sync_service.dart, use the fetched authoritative profile state directly instead of discarding it and triggering a separate dashboard fetch through dashboard_sync_manager.dart.
Research
The system is a real-money gaming platform. It uses a Flutter client, a Node.js backend, PostgreSQL, and Redis. The backend holds a wallet ledger with buckets (deposit, winnings, rewards), three game engines (Crush, Dragon Tiger, Seven Up Down) with scheduler-based round lifecycles, and a leader-election lock for distributed safety. Money mutations use financial.service.js with row-level locks and idempotency keys. Auth uses JWT for users and cookie/bearer for admins. The review confirmed most money paths are safe, but a set of specific bugs remain in admin balance adjustment, game bet idempotency, the realtime event fan-out, migration env scoping, admin least-privilege, and the Flutter client architecture.