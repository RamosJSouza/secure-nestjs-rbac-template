# Authentication

## Overview

The system uses JWT with **RS256**. The private key (`PRIVATE_KEY`) signs tokens; the public key (`PUBLIC_KEY`) verifies. This allows distributing only the public key to services that validate tokens without holding signing capability.

## Token Configuration

| Token | Expiry | Use |
|-------|--------|-----|
| Access token | 15 min | Bearer auth for protected requests |
| Refresh token | 7 days | Obtain new token pair without re-login |

## JWT Payload

- `sub`: User ID
- `email`: User email
- `roleId`: Assigned Role ID

## Flows

### Login
1. Client sends email and password to `POST /api/auth/login`.
2. Server validates credentials, checks account active and not locked.
3. On success: returns `access_token` and `refresh_token`.
4. Refresh token is stored (SHA-256 hash) with IP and User-Agent.

### Refresh
1. Client sends `refresh_token` to `POST /api/auth/refresh`.
2. Server validates token (RS256) and session.
3. If session was revoked (e.g. reuse detected), all user sessions are revoked and error returned.
4. On success: new session created, old session revoked; returns new token pair (rotation).

### Rotation and Reuse Detection
- Each refresh invalidates the previous token.
- If a revoked refresh token is reused, the system revokes all user sessions and logs `auth.refresh_token_reuse_detected`.

### Password Change
- `POST /api/auth/change-password` requires Bearer auth.
- On password change, **all active sessions** for the user are revoked.
- User must re-login on every device.

## Account Lockout

- After **5 failed login attempts**, the account is locked for **15 minutes**.
- Event `auth.account.locked` is logged to audit.
- Deactivated or locked users receive `401 Unauthorized`.

## Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/login | No | Login |
| POST | /api/auth/refresh | No | Exchange refresh token for new pair |
| POST | /api/auth/register | Yes + perm | Create user (users:create) |
| POST | /api/auth/change-password | Yes | Change authenticated user password |
| GET | /api/auth/sessions | Yes | List active sessions for current user |
