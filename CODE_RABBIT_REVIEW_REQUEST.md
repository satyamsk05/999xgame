# CodeRabbit: Full Production Review

**Instruction:** Review the entire `999xgame` repository end-to-end. This PR is intentionally documentation/configuration-only; the target of the review is the existing application code on `main`.

Please identify concrete bugs, security vulnerabilities, data-integrity risks, concurrency/race conditions, broken flows, incomplete implementations, deployment problems, and reliability issues.

Pay special attention to login/authentication, JWT/session handling, admin authorization, game result integrity, wallet/balance transactions, duplicate requests, PostgreSQL consistency, realtime/WebSocket synchronization, Telegram integration, Flutter network/state handling, Docker/AWS deployment, secrets/configuration, CI/CD and test coverage.

Rank findings as **Critical / High / Medium / Low**. For each finding provide the exact file/path and line where possible, explain the failure scenario and impact, and give a concrete remediation. Avoid speculative or purely stylistic comments.
