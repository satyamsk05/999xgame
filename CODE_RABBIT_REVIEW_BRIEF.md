# CodeRabbit Review Brief

Perform a senior-level full-codebase review of 999xgame. Do not limit review to changed files.

Priority: auth/login; authorization/admin; game integrity and race conditions; wallet/balance/transaction consistency and idempotency; PostgreSQL; WebSockets/realtime; Flutter crashes/state/network handling; Telegram/external integrations; secrets/security; Docker/AWS/EC2; CI/CD; tests.

Return only actionable findings, grouped Critical/High/Medium/Low. Include exact file/line where possible, root cause, impact and concrete fix. Explicitly flag anything capable of causing incorrect game results, balance discrepancies, unauthorized access, login failure, data loss, realtime desync or production outage.
