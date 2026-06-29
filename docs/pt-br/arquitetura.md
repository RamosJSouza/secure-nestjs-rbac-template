# Arquitetura

## Visão Geral

O Prime Nest é um backend NestJS pronto para produção, com estrutura modular voltada a escalabilidade e manutenção. O sistema é **single-tenant** (sem escopo por organização no audit ou RBAC).

## Módulos

| Módulo | Finalidade |
|--------|------------|
| AuthModule | Login, refresh, registro, alteração de senha |
| UsersModule | Gestão de usuários (criação via auth/register) |
| RbacModule | Features, Permissions, Roles, RolePermissions |
| AuditModule | Log de auditoria append-only (assíncrono via BullMQ com Redis) |
| MaintenanceModule | Purge agendado de sessões expiradas e audit antigo |
| HealthModule | Probes de liveness e readiness |
| GracefulShutdownModule | Encerramento controlado |
| LoggerModule | Pino e Correlation ID |

## Fluxo de Dados

```
User → Role → RolePermission → Permission → Feature
```

O controle de acesso é aplicado nas rotas via `JwtAuthGuard` e `PermissionGuard` com `@RequirePermissions('feature:action')`.

## Estrutura de Diretórios

```
src/
├── auth/              # Fluxos de autenticação
├── common/            # Guards, decorators
├── config/            # Validação de ambiente (Joi)
├── logger/            # Pino, middleware de correlation ID
├── migrations/       # Migrations e seeds TypeORM
├── modules/
│   ├── audit/        # Log de auditoria
│   ├── health/       # Health checks
│   ├── maintenance/  # Purge de sessões e retenção de audit
│   └── rbac/         # Entidades e serviços RBAC
├── users/            # UsersService
└── main.ts
```

## Decisões de Design

- **Sem schema sync em produção** — Apenas migrations.
- **Validação fail-fast** — Schema Joi valida na inicialização; produção exige variáveis obrigatórias.
- **Auditoria append-only** — Sem updates pela aplicação; purge de retenção remove registros mais antigos que `AUDIT_RETENTION_DAYS`.
- **Swagger exposto** — Intencional; facilita integração e geração de clientes.
