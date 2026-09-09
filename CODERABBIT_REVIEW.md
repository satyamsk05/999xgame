# CodeRabbit Review Request

This PR exists specifically to trigger a deep CodeRabbit review of `999xgame`.

Review the complete repository, not only these documentation/configuration files. Trace cross-layer flows and report actionable defects.

### Highest-priority areas
1. Authentication/login failures and authorization bypasses.
2. Game-round integrity, server authority, randomness/result handling and race conditions.
3. Wallet/balance/deposit/withdrawal correctness, duplicate processing and transactional safety.
4. Admin-panel privileges and sensitive operations.
5. WebSocket/realtime synchronization, reconnects and stale events.
6. Database queries, migrations, constraints and concurrent updates.
7. Flutter crashes, API error handling and state synchronization.
8. Telegram/external integrations.
9. Docker/AWS/EC2 production deployment and CI/CD.
10. Secrets/security exposure and production misconfiguration.

For each issue, include severity, exact file/line when possible, technical reasoning, impact and a practical remediation. Focus on correctness and security rather than cosmetic style comments.
