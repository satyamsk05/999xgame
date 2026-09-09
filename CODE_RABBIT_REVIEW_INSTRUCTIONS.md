# CodeRabbit Review Instructions

Perform a senior production-readiness review of all existing application code in this repository. Do not restrict analysis to the small documentation/configuration diff in this PR.

Check authentication and authorization, admin privileges, game logic and server authority, randomness/result integrity, wallet and monetary state, duplicate/idempotent requests, database transactions and concurrency, realtime/WebSocket event ordering, Flutter state/network/runtime failures, Telegram and external integrations, secrets and security configuration, Docker/AWS/EC2 deployment, CI/CD and tests.

Only report actionable findings. For each finding include severity, exact path/line when possible, technical explanation, impact/failure scenario, and recommended fix. Give highest priority to issues that can cause login failures, incorrect game outcomes, balance inconsistencies, unauthorized access, data loss, realtime desynchronization, or production deployment outages.
