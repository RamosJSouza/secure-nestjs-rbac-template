# Security

## Authentication Model

- **JWT RS256:** Asymmetric signing. Private key never leaves the server; public key can be distributed to validators.
- **Short-lived access tokens:** 15 minutes limit exposure.
- **Refresh token rotation:** Each refresh invalidates the previous token.
- **Reuse detection:** If a revoked refresh token is reused, all sessions for that user are revoked.
- **Password change:** Revokes all active sessions immediately.

## Authorization

- All mutation endpoints require `JwtAuthGuard` (valid Bearer token).
- RBAC enforced via `PermissionGuard` and `@RequirePermissions`.
- Permission check is database-backed (RolePermission) rather than hardcoded.

## Hardening

| Layer | Implementation |
|-------|----------------|
| Rate limiting | 100 req/15min per IP |
| Headers | Helmet |
| CORS | Restricted to ALLOWED_ORIGINS (required in production) |
| Input validation | ValidationPipe with whitelist, forbidNonWhitelisted |
| Config validation | Joi fail-fast on startup |

## Account Protection

- **Lockout:** 5 failed logins → 15-minute lockout.
- **Audit:** auth.account.locked and auth.refresh_token_reuse_detected logged.
- **Deactivation:** Inactive users receive 401 on any authenticated request.

## Production Requirements

- `PRIVATE_KEY` and `PUBLIC_KEY` must be set.
- `DB_SSL=true` for database connections.
- `ALLOWED_ORIGINS` must list allowed frontend URLs.
- Seed credentials must be changed after first deploy.
