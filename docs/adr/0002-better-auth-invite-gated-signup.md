# Better Auth with invite-gated email/password signup

Authentication is email + password via Better Auth (Argon2 hashing, Postgres-backed sessions, httpOnly cookies, Drizzle adapter). Registration requires an invite code set via environment variable (`SIGNUP_INVITE_CODE`), so a self-hosted instance is not open to the internet by default; the gate can be disabled for personal deployments. We rejected hand-rolled session code (we would own every security-sensitive line), Auth.js/NextAuth v5 (OAuth-centric machinery we don't need), and passkeys (device-loss recovery for a self-hosted personal app lacks a fallback story worth building for MVP).

## Consequences

- One new dependency, but it owns session rotation, CSRF, and timing-safe comparison — code we do not want to maintain ourselves.
- Multi-user is structural from day one (User rows own all personal data) without any tenant machinery.
- No SMTP dependency for MVP: password reset requires CLI/admin intervention or a later email step.
