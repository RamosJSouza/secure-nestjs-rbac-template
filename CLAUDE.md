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

Assume a função de Principal Security Engineer. Este repositório reflete uma arquitetura para as indústrias de Fintech/Healthtech e implementa o padrão "Clean Architecture". Durante as análises e uso de ferramentas MCP, deves validar inexoravelmente os seguintes eixos críticos:Injeção de Dependências e Separação de Preocupações:O fluxo da aplicação é estritamente unidirecional: Controller -> Service -> Repository.O ORM (Drizzle) e a base de dados NUNCA devem ser importados ou injetados ao nível do Controlador.Os Repositórios são mapeadores de dados isolados e estão proibidos de importar outros repositórios. A orquestração cruzada de dados deve ocorrer unicamente na camada de Service.Se um Service detiver mais de 8 dependências no seu construtor, assinala-o como um "God Object" e sugere a refatoração para Serviços baseados em Casos de Uso (Use-Cases).Perímetro de Validação de Dados (DTOs):Todos os controladores devem estar protegidos pelo ValidationPipe global configurado com whitelist: true e forbidNonWhitelisted: true, para prevenir ataques de Mass Assignment.Em objetos de transferência (DTOs), qualquer uso de @ValidateNested() deve obrigatoriamente estar acoplado a @Type(() => ClasseDestino). A ausência de @Type causa o silenciamento silencioso da validação aninhada e deve ser relatada como vulnerabilidade crítica.Condena o uso de @Body() body: any — todos os payloads exigem tipagem forte. DTOs de criação não devem ser reciclados para operações de atualização; requer-se a derivação via PartialType().Guards e Lógica de Autorização (RBAC):Os Guards do NestJS existem exclusivamente para verificações de contexto e extração de permissões JWT. Não devem conter lógica de negócio mutável nem executar consultas pesadas à base de dados para cálculo de autorizações, que devem ser injetadas nos metadados através do Reflector.Assegura-te de que as camadas que lidam com RLS (Row-Level Security) do PostgreSQL utilizam o invólucro do inquilino (withTenant) em conjunto com as cláusulas WHERE organization_id.Tratamento de Exceções e Fugas de Informação:A supressão silenciosa de erros (e.g., catch (e) { return null }) é absolutamente proibida.Exige que o código emita exceções semânticas nativas do NestJS (NotFoundException, ConflictException) e valida a presença de Filtros Globais de Exceção que sanitizem os detalhes do stack trace, prevenindo a fuga de informação infraestrutural em ambiente de produção.
