# Observability

## Structured Logging

The application uses **Pino** for high-performance structured logging. Logs include:
- Request/response lifecycle
- Correlation ID for request tracing
- Error stack traces

## Correlation ID

Each request receives an `X-Correlation-Id` (generated or passed in header). It is:
- Propagated to all logs for the request
- Stored in audit log entries
- Returned in response headers for client-side tracing

Use the same correlation ID when calling downstream services or debugging issues.

## Health Checks

| Endpoint | Purpose |
|----------|---------|
| `GET /health/liveness` | Returns `{ status: 'ok' }`. Used by orchestration to verify process is alive. |
| `GET /health/readiness` | Checks database and Redis. Fails if dependencies are unavailable. |

Docker and Kubernetes should use readiness for routing traffic and liveness for restart decisions.

## Audit Log

- Append-only; no updates or deletes.
- Each audited mutation logs: action, entityType, entityId, actorUserId, correlationId, metadata, ip, userAgent.
- Events include: user.create, user.change_password, role.*, auth.refresh_token_reuse_detected, auth.account.locked.

See [Audit Module](../../src/modules/audit/README.md) for integration details.
