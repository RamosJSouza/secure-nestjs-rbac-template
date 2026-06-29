# CLAUDE.md

Este arquivo orienta o Claude ao trabalhar neste repositório.

## Comandos de desenvolvimento

### Execução da aplicação
```bash
# Desenvolvimento com hot-reload
npm run dev

# Produção
npm run build
npm run start:prod

# Testes
npm test

# Teste específico
npm test -- src/auth/auth.service.spec.ts

# Cobertura
npm run test:cov
```

### Qualidade de código
```bash
npm run format
npm run lint
```

### Banco de dados
```bash
# Sincronizar schema (apenas desenvolvimento)
npm run schema:sync

# Gerar migration
npm run migration:generate -- src/migrations/NomeMigracao

# Executar migrations
npm run migration:run

# Reverter última migration
npm run migration:revert

# Seed RBAC
npm run seed:rbac
```

### Docker
```bash
npm run docker:up
npm run docker:down
```

## Arquitetura

### Módulos ativos
- **AppModule** importa: AuthModule, UsersModule, RbacModule, AuditModule, HealthModule, MaintenanceModule, GracefulShutdownModule, LoggerModule (+ OptionalBullModule quando `REDIS_HOST` está definido).
- TasksModule existe no código mas **não** está importado em AppModule.

### Autenticação e autorização
- JWT RS256: `PRIVATE_KEY` assina tokens, `PUBLIC_KEY` verifica.
- Access token: 15min.
- Refresh token: 7d, com rotação e detecção de reutilização.
- Mudança de senha revoga todas as sessões do usuário.
- Lockout: 5 tentativas falhas → bloqueio por 15 minutos.
- Payload JWT: `sub`, `email`, `roleId`.
- Guards: `JwtAuthGuard`, `PermissionGuard` com `@RequirePermissions`.

### Banco de dados
- PostgreSQL com TypeORM.
- Opções em `src/config/database.options.ts`; CLI/migrations usam `src/config/typeorm.datasource.ts`.
- Variáveis: `DB_*` (não POSTGRES_*).
- `synchronize` desabilitado em produção.

### Variáveis de ambiente principais
- `DB_*` — conexão PostgreSQL.
- `PRIVATE_KEY`, `PUBLIC_KEY` — chaves RSA para JWT.
- `REDIS_HOST`, `REDIS_PORT` — cache, health, audit async (BullMQ); sem Redis, audit usa fallback síncrono.
- `PURGE_*`, `AUDIT_RETENTION_DAYS`, `SESSION_GRACE_DAYS` — crons de purge (MaintenanceModule).
- `PORT` — porta do servidor.
- `NODE_ENV` — development | production | test.
- `ALLOWED_ORIGINS` — obrigatório em produção.

### Estrutura de diretórios
- DTOs em `dto/`.
- Entities em `entities/`.
- Guards em `common/guards/`.
- Swagger em `/api/docs`.
