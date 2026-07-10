# Configuration

The project uses `@nestjs/config` and Joi for environment validation.

## Environment Variables

The `.env` file must be at the project root.

### Application
- `NODE_ENV`: `development`, `production`, or `test`. Default: `development`
- `PORT`: Server port. Default: `3000`
- `APP_NAME`: Application name (optional)
- `API_PREFIX`: Global route prefix. Default: `api` — all routes are served under `/api/*` (e.g. `/api/auth/login`). Swagger UI: `/api/docs`

### Database (PostgreSQL)
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `DB_SSL`: `true` for TLS (required in production)
- `DB_LOGGING`: `true` for SQL logs (optional)
- `DB_SYNCHRONIZE`: `true` for auto-sync (dev only)
- `DB_POOL_MAX`: Connection pool max. Default: `20`

In production, `synchronize` is always `false`; use migrations.

### Authentication (JWT RS256)
- `PRIVATE_KEY`: RSA private key in PEM format (signs tokens)
- `PUBLIC_KEY`: RSA public key in PEM format (verifies tokens)

Generate keys:
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

In `.env`, paste PEM content as a single line, replacing newlines with `\n`. Both required in production.

### CORS
- `ALLOWED_ORIGINS`: Comma-separated URLs (e.g. `https://admin.example.com`). **Required in production.**

### Redis
- `REDIS_HOST`, `REDIS_PORT` (default: 6379)
- `REDIS_PASSWORD`: Optional; when set, enables Redis AUTH and is passed to Keyv

Without `REDIS_HOST`, RBAC permission cache and JWT denylist use an in-memory fallback (per process). Set `REDIS_HOST` in every multi-replica deployment.

When Redis is enabled, the cache uses a two-tier setup: in-process L1 (`KeyvCacheableMemory`) plus Redis L2 for shared invalidation across replicas.

### Email (Resend)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` (optional)

## Validation

The Joi schema in `src/config/validation.schema.ts`:
- Fails fast on startup with all validation errors
- Requires `PRIVATE_KEY` and `PUBLIC_KEY` when `NODE_ENV=production`
- Requires `DB_SSL=true` in production
- Requires `ALLOWED_ORIGINS` in production (URL format)
