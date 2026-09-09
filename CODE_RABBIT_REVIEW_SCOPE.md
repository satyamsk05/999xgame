# CodeRabbit Review Scope

Review the entire 999xgame application on this PR, including existing Flutter, backend, database, realtime, integrations, Docker/AWS and CI/CD code. Prioritize concrete production defects and security risks over style.

Focus especially on authentication/login, authorization/admin access, game-round integrity and race conditions, wallet/balance transactions and idempotency, PostgreSQL consistency, WebSocket/realtime synchronization, Telegram/external integrations, Flutter crashes/state/network failures, secrets/configuration, Docker/AWS deployment, CI/CD and test coverage.

Report findings by Critical/High/Medium/Low severity with exact file and line references where possible, failure scenario, impact, and concrete remediation. Do not limit the review to files changed by this PR.
