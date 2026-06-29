# Architecture

## Overview

Prime Nest is a production-ready NestJS backend with a modular structure designed for scalability and maintainability. The system is **single-tenant** (no organization scoping in audit or RBAC).

## Module Structure

| Module | Purpose |
|--------|---------|
| AuthModule | Login, refresh, register, change-password |
| UsersModule | User management (creation via auth/register) |
| RbacModule | Features, Permissions, Roles, RolePermissions |
| AuditModule | Append-only audit logging (async via BullMQ when Redis is configured) |
| MaintenanceModule | Scheduled purge of expired sessions and old audit logs |
| HealthModule | Liveness and readiness probes |
| GracefulShutdownModule | Clean shutdown handling |
| LoggerModule | Pino + Correlation ID |

## Data Flow

```
User → Role → RolePermission → Permission → Feature
```

Access control is enforced at the route level via `JwtAuthGuard` and `PermissionGuard` with `@RequirePermissions('feature:action')`.

## Directory Structure

```
src/
├── auth/              # Authentication flows
├── common/            # Guards, decorators
├── config/            # Environment validation (Joi)
├── logger/            # Pino, correlation ID middleware
├── migrations/        # TypeORM migrations and seeds
├── modules/
│   ├── audit/         # Audit log
│   ├── health/        # Health checks
│   ├── maintenance/   # Session and audit retention purge
│   └── rbac/          # RBAC entities and services
├── users/             # UsersService
└── main.ts
```

## Design Decisions

- **No schema sync in production** — Migrations only.
- **Fail-fast validation** — Joi schema validates on startup; production enforces required vars.
- **Append-only audit** — No application updates; retention purge removes rows older than `AUDIT_RETENTION_DAYS`.
- **Swagger exposed** — Intentional; facilitates integration and client generation.
