# Análise Profunda do Codebase — `secure-nestjs-rbac-template` (v2 — revisada e expandida)

> Auditoria estática de segurança, corretude, performance, compliance, infraestrutura e oportunidades.
> Data: 28/Jun/2026 · Branch: `master` · Pacote: `prime-nestjs@2.1.0`
> Esta é a **segunda revisão** da análise — inclui **crítica à versão anterior**, correções de
> severidade/imprecisões, **novos achados** e uma seção inédita de **oportunidades de recursos**.
> Evidências em `arquivo:linha`. Linguagem: Português.

---

## Ferramentas e skills utilizadas

| Recurso | Papel na análise |
|---------|------------------|
| **Leitura exhaustiva** | Todos os módulos, guards, entities, DTOs, 7 migrações, Dockerfile, `docker-compose`, `setup.sh`, `endpoints.json`, specs unit/e2e, configs. |
| **Context7 (MCP)** | Validou API do `CacheModule` no NestJS v11 (Keyv/stores), query cache do TypeORM, `@nestjs/throttler` v6 (`@Throttle`, `APP_GUARD`, `getTracker`), `setGlobalPrefix`. Source reputation: High. |
| **Sequential Thinking (MCP)** | Decomposição em camadas (segurança → corretude → compliance → perf → infra → deps → features) e priorização com revisão de hipóteses. |
| **SuperPowers (skills)** | Aplicado o princípio *verification-before-completion*: every claim re-checkada contra o código (ex.: conferi ausência de `yarn.lock`, presença de `getEcho`, imports de `MailModule`). |
| **Grep/Glob/Shell** | Verificação de imports órfãos, locks, CI, lint. |

---

## Sumário executivo

O projeto é uma fundação backend NestJS **security-first** com intenção sólida, mas com
**divergência significativa entre README/documentação e o código entregue**, além de
**artefatos de build/infra quebrados** não detectados na v1.

Totais nesta revisão:

- **4 falhas críticas** (S1, S2, S3, I1) · **9 altas** · **~18 médias** · **~17 baixas**
- **Novos achados v2**: Dockerfile quebrado sem `yarn.lock`; `setup.sh` apaga o README;
  ausência total de CI; race condition em refresh + rotação não transacional; gaps de
  compliance no audit (login sucesso não auditado, RBAC mutations sem IP/UA,
  `assignPermissions` perde `permissionIds`); divergência de índices entidade vs migration;
  `app.controller.spec.ts` referencia método inexistente; `MailModule` órfão;
  `ScheduleModule` ocioso; conflitos de lint; política de auth opt-in por controller.

As três falhas mais urgentes:

1. **S1 — Refresh token aceito como access token.** Mesmo payload RS256 `{sub,email,roleId}`,
   só differindo em `expiresIn`; `JwtStrategy` aceita qualquer JWT RS256 válido → refresh
   (7d) vale como access (15m). (`auth/auth.service.ts:218,259`, `auth/strategy/jwt.strategy.ts:17`)
2. **S2 — `changePassword` sem senha atual.** Access token roubado → takeover permanente.
   (`auth/auth.controller.ts:95`, `auth/auth.service.ts:309`)
3. **S3 — Cache RBAC não é Redis.** `CacheModule.register({ttl,max})` sem `stores` é
   incompatível com NestJS v11 (Keyv); `max` não existe mais; README mente sobre
   "Cache: Redis" + "horizontal scaling". Permissões stale entre réplicas.
   (`modules/rbac/rbac.module.ts:27`)

E a falha de infra mais urgente (nova):

4. **I1 — Dockerfile quebrado sem `yarn.lock`.** Stage 2 faz
   `COPY --from=builder /app/package.json /app/yarn.lock ./` mas **não existe `yarn.lock`**
   no repo (confirmado) → `COPY` falha → `docker build` inviável como entregue.

---

## Crítica à análise anterior (v1) — autocorreção

A v1 foi majoritariamente correta, mas contém **imprecisões, superestimativas e omissões**
que esta versão corrige:

| Item v1 | Correção v2 |
|---------|-------------|
| **S3** afirmava que `CacheModule.register({ttl,max})` é "inválido" no todo. | **Refino**: `ttl` **é** uma opção válida no NestJS v11 (define TTL global em ms, default 0). O inválido é `max` (LRU removido no cache-manager v6+) e, principalmente, a **ausência de `stores`** — sem store, o `CACHE_MANAGER` não tem backend. Context7 confirma. |
| **S4** marcada como Crítica. | **Downgrade → Alta**. O bypass via refresh exige uma **sessão já válida**; lockout é defesa contra brute-force de senha. Ainda grave (permite novo access token a conta bloqueada), mas não Crítica isolada. |
| **S7** sugeria vazamento ativo do hash. | **Refino**: hoje **nenhum endpoint devolve `req.user`** (`/premium-echo` devolve o body). O risco é **latente** (logs, serialização de erro, futuro endpoint). Mantém Alta por defense-in-depth, mas com caveat. |
| **S8** listava "senha errada" como vetor de enumeração. | **Refino**: senha errada devolve o mesmo `"Invalid credentials"` de usuário inexistente (bom). A enumeração real é `"User account is deactivated"` e `"Account locked..."`, que aparecem **antes** da checagem de senha (`auth.service.ts:129-138`) — revelam existência + estado sem a senha. |
| **B16** (Feature update stale) apresentada como bug ativo. | **Refino**: é **latente** — só se manifesta **após** B2 ser corrigido (hoje o query cache TypeORM é ignorado, então não há cache para ficar stale). Manter, mas com dependência explícita. |
| **B17** (Permission no cache invalidation) atrelada ao query cache. | **Refino**: o impacto **vivo** hoje é via o cache in-memory do `RbacService` (S3), que armazena `${feature.key}:${action}`. Renomear `action` sem invalidar mantém o guard servindo string stale. Independente de B2. |
| **Resumo v1** dizia "3 críticas, 5 altas" mas a matriz listava 4 críticas + D1. | **Corrigido** para contagem consistente. |
| **D4** continha caractere incorreto ("相同"). | **Corrigido**. |
| **Omissões v1** (novos achados aqui): | I1 (Dockerfile), I2 (`setup.sh` apaga README), I3 (sem CI), I4 (lint conflita com seed/specs), S10 (auth opt-in p/ controller), S11 (race em refresh + rotação não transacional), S12 (dev sem chaves crasha), C1–C4 (gaps de compliance do audit), B21 (`getEcho` inexistente), B22 (divergência índices entidade/migration), B23/B24 (índices faltantes), B25 (`MailModule` órfão), B26 (`UsersService` métodos mortos), P7 (`ScheduleModule` ocioso), P8 (`DataSource` alloc + dotenv duplo), e toda a seção **Oportunidades de recursos**. |

---

## Matriz de severidade (v2)

| ID | Título | Sev | Categoria | Arquivo |
|----|--------|-----|-----------|---------|
| S1 | Refresh token aceito como access token | 🔴 | Segurança | `auth/auth.service.ts:218,259`, `auth/strategy/jwt.strategy.ts:17` |
| S2 | `changePassword` sem senha atual | 🔴 | Segurança | `auth/auth.controller.ts:95`, `auth/auth.service.ts:309` |
| S3/D1 | Cache RBAC não é Redis (sem `stores`, NestJS v11) | 🔴 | Segurança+Infra | `modules/rbac/rbac.module.ts:27` |
| I1 | Dockerfile quebrado sem `yarn.lock` | 🔴 | Infra/DevOps | `Dockerfile:20`, repo (sem `yarn.lock`) |
| S4 | Lockout bypass via refresh | 🟠 | Segurança | `auth/auth.service.ts:205` |
| S5 | DB SSL `rejectUnauthorized:false` | 🟠 | Segurança | `config/database.ts:19` |
| S6 | Rate limit global único, sem throttler por endpoint | 🟠 | Segurança | `main.ts:28` |
| S7 | `req.user` expõe hash (latente) | 🟠 | Segurança | `auth/strategy/jwt.strategy.ts:40` |
| S8 | Enumeração de usuários (deactivated/locked pré-senha) | 🟠 | Segurança | `auth/auth.service.ts:129-138` |
| S9 | Sem logout / revogação por token | 🟠 | Segurança+Gap | `auth/auth.controller.ts` |
| S10 | Auth opt-in por controller (sem guard global / `@Public`) | 🟠 | Segurança+Design | `app.module.ts`, controllers |
| S11 | Race em refresh + rotação não transacional | 🟠 | Segurança+Bug | `auth/auth.service.ts:182-289` |
| S12 | Dev sem chaves crasha no boot (Joi permite vazio) | 🟡 | Confiabilidade | `config/validation.schema.ts:16-34`, `auth/strategy/jwt.strategy.ts:17` |
| B1 | `auth.service.spec.ts` quebrado | 🟠 | Testes | `auth/auth.service.spec.ts:23-35,77-81` |
| B2 | Query cache TypeORM ignorado | 🟠 | Bug/Perf | `config/database.ts`, `permission.service.ts:35`, `role.service.ts:58`, `feature.service.ts:61` |
| B3 | Register não atribui role → contas mortas | 🟠 | Bug/Gap | `auth/auth.service.ts:300` |
| B21 | `app.controller.spec.ts` chama `getEcho` inexistente | 🟠 | Testes | `app.controller.spec.ts:55-63` |
| I2 | `setup.sh` apaga README + `schema:sync`+`migration:run` conflitam | 🟠 | Infra | `setup.sh:71-84` |
| I3 | Sem CI (`.github` inexistente) | 🟠 | Infra/DevOps | repo |
| I4 | Lint conflita com seed (no-console) e specs (no-var-requires); linebreak unix no Windows | 🟠 | Infra/DevOps | `.eslintrc.js`, `migrations/seeds/rbac.seed.ts`, `auth.service.spec.ts:70` |
| P1 | bcrypt síncrono bloqueia event loop | 🟠 | Perf | `auth/auth.service.ts:140,298,315` |
| B4 | Soft-delete vs unique email → re-register 500 | 🟡 | Bug | `users/users.service.ts:29`, migration `1707764400000` |
| B5 | `RolePermission.granted` morto | 🟡 | Gap | `modules/rbac/services/role.service.ts:135` |
| B6 | Reuso revoga todas as sessões; family é dead code | 🟡 | Bug | `auth/auth.service.ts:39-104` |
| B8 | `getSessionFamilyIds` N+1 sequencial | 🟡 | Perf | `auth/auth.service.ts:73-104` |
| B9 | `JwtStrategy` valida por email, não por `sub` | 🟡 | Bug/Perf | `auth/strategy/jwt.strategy.ts:22-23` |
| B11 | `GET /premium-echo` com `@Body` + reflexão | 🟡 | Bug+Seg | `app.controller.ts:15-20` |
| B12 | `TasksModule` morto + controller sem guard | 🟡 | Dead code | `tasks/*`, `app.module.ts` |
| B16 | `FeatureService.update` retorna stale via cache (latente pós-B2) | 🟡 | Bug | `modules/rbac/services/feature.service.ts:71-79` |
| B17 | `PermissionService` não invalida cache RBAC (vivo via S3) | 🟡 | Bug | `modules/rbac/services/permission.service.ts:52-66` |
| B19 | `OrganizationsModule` placeholder (half multi-tenant) | 🟡 | Gap | `modules/organizations/*` |
| B20 | `synchronize` false em test; e2e sem setup | 🟡 | Testes | `config/database.ts:16`, `test/jest-e2e.json` |
| B22 | Divergência de índices entidade vs migration (users/roles) | 🟡 | Bug/Perf | migration `1707764400000`, `user.entity.ts`, `role.entity.ts` |
| C1 | Login sucesso não é auditado | 🟡 | Compliance | `auth/auth.service.ts:160-162` |
| C2 | AuditInterceptor não captura IP/UA em mutações RBAC | 🟡 | Compliance | `modules/audit/interceptors/audit.interceptor.ts:40-56` |
| C3 | `assignPermissions` audit perde `permissionIds` | 🟡 | Compliance | `role.service.ts:115-153`, `audit.interceptor.ts:90-104` |
| P2 | DB hit por requisição autenticada | 🟡 | Perf | `auth/strategy/jwt.strategy.ts:23` |
| P3 | Health Redis abre novo client a cada probe | 🟡 | Perf/Resiliência | `modules/health/indicators/redis.health.ts:24-38` |
| P4 | `AuditLogService` insert síncrono + erros engolidos | 🟡 | Perf/Compliance | `modules/audit/audit-log.service.ts:42-48` |
| P6 | Sessões/audit sem purge/retention | 🟡 | Operacional | migrations |
| I5 | Redis/Postgres expostos com creds default | 🟢 | Infra | `docker-compose.yml:40-55` |
| B7 | `constantTimeCompare` redundante | 🟢 | Bug | `auth/auth.service.ts:191` |
| B10 | Race em `recordFailedLogin` | 🟢 | Bug | `users/users.service.ts:42-55` |
| B13 | `endpoints.json` stale (2021) | 🟢 | Dead code | `endpoints.json` |
| B14 | `LoggerService` duplicado | 🟢 | Dívida | `logger/logger.service.ts` |
| B15 | `RoleService.create` transação desnecessária | 🟢 | Perf | `modules/rbac/services/role.service.ts:26-52` |
| B18 | `audit_logs.metadata` NOT NULL sem default DB | 🟢 | Fragilidade | migration `1740100000000` |
| B23 | Sem índice em `audit_logs.correlation_id` | 🟢 | Perf | migration `1740400000000` |
| B24 | Sem índice em `sessions(expires_at, revoked_at)` | 🟢 | Perf | migration `1739462400000` |
| B25 | `MailModule`/`MailService` órfãos | 🟢 | Dead code | `src/common/mail/*` |
| B26 | `UsersService.findAll/findById/remove` mortos | 🟢 | Dead code | `users/users.service.ts:25,35,72` |
| P5 | `RoleService.findAll` sem paginação | 🟢 | Perf | `modules/rbac/services/role.service.ts:54-60` |
| P7 | `ScheduleModule` ocioso (TasksModule morto) | 🟢 | Perf/Dívida | `app.module.ts:34` |
| P8 | `DataSource` instanciado em module-load + `dotenv` duplo | 🟢 | Perf/Dívida | `config/database.ts:4,27` |
| D2 | Migrar para `@nestjs/throttler` | 🟡 | Deps | `main.ts:28` |
| D3 | Sem global prefix (docs/insomnia esperam `api`) | 🟢 | Consistência | `main.ts` |
| D4 | Password policy fraca/inconsistente | 🟡 | Segurança | `auth/dto/*` |
| D5 | `MailModule` presente mas não integrado | 🟢 | Deps/Gap | `src/common/mail/*` |

---

## 1. Falhas de segurança

### 🔴 S1 — Refresh token aceito como access token

```218:228:src/auth/auth.service.ts
    const payload = { sub: user.id, email: user.email, roleId: user.roleId };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRES,   // 15m
      algorithm: 'RS256',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: REFRESH_TOKEN_EXPIRES,  // 7d
      algorithm: 'RS256',
    });
```

`JwtStrategy` (`jwt.strategy.ts:14-19`) só verifica assinatura RS256 + `exp`. Nenhuma
claim distingue tipos. Um refresh token (7d) apresentado como `Authorization: Bearer`
passa em qualquer rota protegida → janela de privilégio de 15 min vira 7 dias.

**Fix (PoC):**

```ts
// sign
const accessToken = this.jwtService.sign({ ...payload, tokenType: 'access' }, { expiresIn: ACCESS_TOKEN_EXPIRES, algorithm: 'RS256' });
const refreshToken = this.jwtService.sign({ ...payload, tokenType: 'refresh' }, { expiresIn: REFRESH_TOKEN_EXPIRES, algorithm: 'RS256' });

// JwtStrategy.validate
if (payload.tokenType !== 'access') throw new UnauthorizedException('Wrong token type');

// AuthService.refresh
if (payload.tokenType !== 'refresh') throw new UnauthorizedException('Not a refresh token');
```

---

### 🔴 S2 — `changePassword` sem senha atual

`ChangePasswordDto` só tem `newPassword`. `AuthService.changePassword` (`auth.service.ts:309`)
apenas hasheia e grava. Roubo de access token → takeover permanente + revoga sessões da vítima.

**Fix:** exija `currentPassword` validado com `bcrypt.compare` (async — ver P1), ou
step-up auth. Audite como `auth.password_change`.

---

### 🔴 S3 / D1 — Cache RBAC não é Redis (NestJS v11)

```27:31:src/modules/rbac/rbac.module.ts
        CacheModule.register({
            ttl: 300000,
            max: 1000,
        }),
```

**Correção à v1:** `ttl` é válido (TTL global ms; default 0). O inválido é `max` (LRU
removido em cache-manager v6+) e, principalmente, **ausência de `stores`** — sem store,
o `CACHE_MANAGER` não tem backend. Context7 confirma que NestJS v11 exige
`stores: [new KeyvRedis(...) | new KeyvCacheableMemory(...)]`.

**Impacto:** README/docs afirmam "Cache: Redis" e "horizontal scaling supported" — **falso**.
Em réplicas, cada nó tem cache próprio → após `invalidateRoleCache`, só o nó local limpa;
os demais servem permissões stale até TTL (5 min). `pendingRequests` (dedup in-voo) também
é por processo.

**Fix:**

```ts
// app.module.ts
import KeyvRedis from '@keyv/redis';

CacheModule.registerAsync({
  isGlobal: true,
  useFactory: (cfg: ConfigService) => ({
    ttl: cfg.get<number>('RBAC_CACHE_TTL', 300_000),
    stores: [new KeyvRedis({ socket: { host: cfg.get('REDIS_HOST'), port: cfg.get<number>('REDIS_PORT') } })],
  }),
  inject: [ConfigService],
}),
```

Remover o `CacheModule.register` local do `RbacModule`. Reuse o client Redis no health (P3).

---

### 🟠 S4 — Lockout bypass via refresh (downgrade de Crítica)

`refresh` (`auth.service.ts:195-211`) checa `revokedAt`, `expiresAt`, `isActive`, mas
**não** `lockedUntil`. `login` (`:134`) e `JwtStrategy` (`:36`) checam. Conta bloqueada
continua rotacionando tokens → novos access tokens. Mantém Alta (não Crítica) pois exige
sessão já válida.

**Fix:** centralize `ensureNotLocked(user)` e chame em `login`, `refresh` e `JwtStrategy`.

---

### 🟠 S5 — DB SSL com `rejectUnauthorized:false`

`config/database.ts:19`. Joi exige `DB_SSL=true` em prod, mas a validação de cert está
off → MITM. **Fix:** `ssl: { ca: fs.readFileSync(process.env.DB_SSL_CA), rejectUnauthorized: true }`
em prod; reservar `false` só p/ dev.

---

### 🟠 S6 — Rate limit global único

`main.ts:28` usa `express-rate-limit` global 100/15min compartilhado entre todos os
endpoints. Atacante esgota orçamento em qualquer rota → bloqueia login de legítimos
(DoS-self). P/ brute-force permite ~100/15min/IP.

**Fix (Context7 — `@nestjs/throttler` v6):**

```ts
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 120 }])],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
// no AuthController:
@Throttle({ default: { limit: 10, ttl: seconds(60), getTracker: (req) => req.body?.email ?? req.ip } })
```

---

### 🟠 S7 — `req.user` expõe hash (latente)

`JwtStrategy.validate` retorna a entidade `User` completa (com `password`) via
`usersService.findOne` sem `select`. Hoje **nenhum endpoint devolve `req.user`** (caveat
adicionado à v1), mas é risco latente em logs/erros/futuros endpoints.

**Fix:** `findOne` com `select: { id, email, name, roleId, isActive, lockedUntil }` ou
projetar `AuthenticatedUser` sem `password`; `@Exclude()` + `ClassSerializerInterceptor`.

---

### 🟠 S8 — Enumeração de usuários (refinado)

`auth.service.ts:129-138`: `"User account is deactivated"` e `"Account locked..."`
(disponibiliza timestamp) aparecem **antes** da checagem de senha → revelam existência +
estado sem a senha. Senha errada já é uniforme com "Invalid credentials" (bom).

**Fix:** mensagem genérica `"Invalid credentials"` para todos os falhas de credencial;
detalhes só em log/audit; estado de lock via canal out-of-band.

---

### 🟠 S9 — Sem logout / revogação por token

Inexistente. Refresh roubado vale 7d. **Fix:** `POST /auth/logout` (revoga sessão pelo
hash do refresh), `POST /auth/logout-all`; `jti` + denylist Redis p/ access tokens.

---

### 🟠 S10 — Auth opt-in por controller (sem guard global / `@Public`) — novo

Não há `APP_GUARD` global; cada controller declara `@UseGuards(JwtAuthGuard, PermissionGuard)`
individualmente. Um controller futuro que **esquecer** fica público sem intenção. Health é
público por omissão de guard. Padrão inseguro p/ template "security-first".

**Fix:** registre `JwtAuthGuard` + `PermissionGuard` como `APP_GUARD` global e crie
`@Public()` para exceções explícitas (health, login, refresh). Default-deny.

---

### 🟠 S11 — Race em refresh + rotação não transacional — novo

`auth.service.ts:182-289`: o check `if (session.revokedAt)` + `rotateSession` não é
atômico. Dois requests concorrentes com o **mesmo** refresh token: ambos leem
`revokedAt = null`, ambos revogam o old, ambos criam new sessions → **dois** refresh
tokens válidos emitidos do mesmo token, sem disparar reuse-detection. Além disso,
`rotateSession` revoga o old **antes** de salvar o new; se o `save` do new falhar,
o old já está revogado e o usuário recebe 500 → no próximo refresh com o old (agora
revogado) dispara reuse-detection → **falso positivo** revoga tudo.

**Fix:** wrap em transação com `SELECT ... FOR UPDATE` (pessimistic lock) na sessão;
ou lock otimista via versão. Só revogue o old após commit do new.

```ts
await this.dataSource.transaction(async (em) => {
  const session = await em.findOne(Session, { where: { id }, lock: { mode: 'pessimistic_write' } });
  if (session.revokedAt) { /* reuse */ throw ...; }
  session.revokedAt = new Date();
  await em.save(session);
  const newSession = em.create(Session, { ... });
  await em.save(newSession);
  // sign tokens após commit
});
```

---

### 🟡 S12 — Dev sem chaves crasha no boot — novo

`validation.schema.ts:16-34` permite `PRIVATE_KEY`/`PUBLIC_KEY` vazios fora de produção.
Mas `JwtStrategy` (`jwt.strategy.ts:17`) faz `super({ secretOrKey: configService.get('keys.publicKey') })`
→ passport-jwt lança `secretOrKey has an invalid value` com string vazia → **crash no
bootstrap**. Contradição fail-fast: Joi diz "ok em dev", runtime diz "crash".

**Fix:** exigir chaves não-vazias em **todos** os ambientes (ou prover chaves de dev
embandeiradas + warning), e validar no `useFactory` do `JwtModule`.

---

## 2. Bugs e gaps de corretude

### 🟠 B1 — `auth.service.spec.ts` quebrado

`auth.service.spec.ts:23-35` fornece só `JwtService` + `UsersService`; o construtor
exige `AuditLogService` + `@InjectRepository(Session)`. `:77-81` afirma `sign` chamado
com 1 arg, mas o código passa 2. `createTokensAndSession` usa `sessionRepository` não
mockado. → `npm test -- auth.service.spec` falha.

**Fix:** mockar `AuditLogService` (`{ log: jest.fn() }`), `getRepositoryToken(Session)`,
corrigir asserção para `toHaveBeenCalledWith(payload, expectedOptions)`.

---

### 🟠 B2 — Query cache TypeORM ignorado

`config/database.ts` sem `cache`. `permission.service.ts:35` (`cache:300000`),
`role.service.ts:58` (`cache:true`), `feature.service.ts:61` (`cache:60000`) →
silenciosamente ignorados (Context7 confirma: exige `DataSourceOptions.cache`).

**Fix:** `cache: { type: 'redis', options: { socket: { host, port } }, ignoreErrors: true, duration: 30000 }`
ou remover `cache:` das queries.

---

### 🟠 B3 — Register não atribui role

`RegisterDto` sem `roleId`; `auth.service.ts:300` cria user sem role → `roleId=null` →
`PermissionGuard` rejeita em qualquer rota protegida. Conta inútil.

**Fix:** `roleId` opcional (`@IsUUID`) em `RegisterDto` ou role default via config;
validar existência da role antes de salvar.

---

### 🟠 B21 — `app.controller.spec.ts` chama `getEcho` inexistente — novo

`app.controller.spec.ts:55-63` testa `appController.getEcho(body)`, mas `AppController`
(`app.controller.ts`) só tem `getHello` e `getPremiumEcho`. → `TypeError: getEcho is not a function`.

**Fix:** remover o teste `getEcho` ou reintroduzir o método (não recomendado — ver B11).

---

### 🟠 I2 — `setup.sh` apaga README + conflito schema:sync/migration — novo

`setup.sh:83-84`:
```bash
rm -rf ./README.md
touch ./README.md
```
**Destrói a documentação** após setup (provável leftover de gerador de boilerplate).
Além disso `:71` roda `schema:sync` e `:77` roda `migration:run` — sync cria tabelas,
migrations tentam recriar → erro de "already exists" (ou drift silencioso).

**Fix:** remover o bloco `rm -rf README.md`; escolher **um** de schema:sync (dev) ou
migrations (padrão), não ambos.

---

### 🟠 I3 — Sem CI (`.github` inexistente) — novo

Nenhum workflow de CI. Para um template "production-ready" com Husky/commitlint
configurados, falta pipeline que rode `lint`, `test`, `test:cov`, `migration:run`
(em DB efêmero) e `npm audit` em PRs.

**Fix:** adicionar `.github/workflows/ci.yml` com Postgres+Redis services, migrations,
lint, testes unit + e2e, e check de cobertura mínima.

---

### 🟠 I4 — Lint conflita com seed/specs; linebreak unix no Windows — novo

`.eslintrc.js`: `no-console: 'error'` × `migrations/seeds/rbac.seed.ts` (usa `console.log`
extensivamente); `@typescript-eslint/no-var-requires: 'error'` × `auth.service.spec.ts:70`
(`require('bcryptjs')`); `linebreak-style: ['error','unix']` × repositório Windows (CRLF).
→ `npm run lint` provavelmente falha.

**Fix:** `no-console: ['error', { allow: ['warn','error'] }]` + override de `no-console`
para `migrations/seeds/**`; substituir `require('bcryptjs')` por `import bcryptjs from 'bcryptjs'`;
considerar `linebreak-style: off` + `.gitattributes` com `* text=auto eol=lf`.

---

### 🟡 B4 — Soft-delete vs unique email

`User` tem `@DeleteDateColumn` + `email` unique. Soft-deletado: `findOne(email)` filtra
(null) → `register` passa na checagem → `save` viola `users_email_key` → 500 não tratado.

**Fix:** unique partial `WHERE deleted_at IS NULL`, ou hard delete, ou `catch 23505` →
`ConflictException`.

---

### 🟡 B5 — `RolePermission.granted` morto

Sempre `granted: true` (`role.service.ts:135`). Deny nunca implementado. **Fix:**
implementar deny ou remover a coluna.

---

### 🟡 B6 — Reuso revoga todas as sessões; family é dead code

`revokeSessionFamilyAndLogReuse` (`auth.service.ts:39-71`) computa `sessionFamilyIds`
mas a `UPDATE` revoga **todas** do usuário (`where user_id`), sem filtrar
`revoked_at IS NULL`. Ou use a família na query, ou remova `getSessionFamilyIds`.

---

### 🟡 B8 — `getSessionFamilyIds` N+1 sequencial

`auth.service.ts:73-104`: um `findOne` por ancestral + BFS por nível. **Fix:** única
query recursiva (CTE) — ver PoC na v1.

---

### 🟡 B9 — `JwtStrategy` valida por email, não por `sub`

`jwt.strategy.ts:22-23` busca por `payload.email` em vez de `payload.sub`. Email mutável
invalida tokens; acopla identidade a campo mutável. **Fix:** `findById(payload.sub)` + cache
curto (P2).

---

### 🟡 B11 — `GET /premium-echo` com `@Body` + reflexão

`app.controller.ts:15-20`: GET com `@Body` (Express não parseia body em GET → undefined),
sem DTO, reflexão em template "secure". **Fix:** remover.

---

### 🟡 B12 — `TasksModule` morto

Não importado em `AppModule`; `@Cron`/`@Interval`/`@Timeout` nunca disparam;
`TasksController` sem guards; `tasks.entity.ts` vazio. **Fix:** remover ou tornar real + guards.

---

### 🟡 B16 — `FeatureService.update` retorna stale via cache (latente pós-B2)

`feature.service.ts:71-79`: `findOne` com `cache:60000` após update serve registro
anterior. **Latente** até B2 ser corrigido. **Fix:** invalidar query cache após update
ou remover `cache` do `findOne`.

---

### 🟡 B17 — `PermissionService` não invalida cache RBAC (vivo via S3)

`permission.service.ts:52-66` (`update`/`remove`) não invalidam. Renomear `permission.action`
muda a string `feature:action` que o `RbacService` cacheou (in-memory, ativo — S3) → guard
serve permissão stale. **Fix:** invalidar cache de roles afetadas; idealmente **bloquear**
mudança de `action` (é identidade); permitir só `name`/`description`.

---

### 🟡 B19 — `OrganizationsModule` placeholder

Sem service/controller; `RequestContext.organizationId` nunca populado; `User` sem
`organizationId`; `AuditLog.organization_id` + FKs/índices são yagni. **Fix:** implementar
multi-tenant ou remover do audit até precisar.

---

### 🟡 B20 — `synchronize` false em test; e2e sem setup

`database.ts:16-17`: sync só em `development`. `test/jest-e2e.json` sem setup DB; `app.e2e-spec.ts`
importa `AppModule` (precisa DB + Redis + chaves). **Fix:** Testcontainers ou sqlite
in-memory com sync; documentar.

---

### 🟡 B22 — Divergência de índices entidade vs migration — novo

Migration `1707764400000`:
- `IDX_users_is_active_partial ON users(email) WHERE isActive=true` — redundante (email já unique).
- `IDX_roles_is_active_partial ON roles(id) WHERE isActive=true` — **inútil** (índice na PK).

Entidades declaram `@Index(['email','isActive'])`, `@Index(['roleId','isActive'])` (user) e
`@Index(['name','isActive'])` (role) — **não criados** pelas migrations. Em dev (sync=true)
TypeORM os criaria; em prod (migrations-only) **não existem** → divergência de schema entre
ambientes + queries `where name=... and isActive=...` sem índice em prod.

**Fix:** migration correctiva criando os índices compostos declarados nas entidades;
remover os parciais inúteis/redundantes.

---

### 🟢 B7 — `constantTimeCompare` redundante

`auth.service.ts:191`: lookup por hash exato já garantiu igualdade. **Fix:** remover ou
documentar como defesa em profundidade.

---

### 🟢 B10 — Race em `recordFailedLogin`

`users.service.ts:42-55`: increment + findOne + shouldLock não atômico. **Fix:**
`UPDATE ... SET ... RETURNING` atômico.

---

### 🟢 B13 — `endpoints.json` stale (2021)

Referencia `/health-check`, `/echo`, `global_prefix: 'api'` — inexistentes. **Fix:**
remover ou regenerar do Swagger; alinhar global prefix.

---

### 🟢 B14 — `LoggerService` duplicado

`logger/logger.service.ts` wrapper Nest Logger; app usa `nestjs-pino`. Só usado em
`TasksService` (morto). **Fix:** remover; usar `app.get(Logger)` do pino.

---

### 🟢 B15 — `RoleService.create` transação desnecessária

`role.service.ts:26-52`: queryRunner para um único save. **Fix:** `save` direto; manter
transação só em `assignPermissions`.

---

### 🟢 B18 — `audit_logs.metadata` NOT NULL sem default DB

Migration `1740100000000` sem `default`. Inserts diretos sem metadata → 23502. **Fix:**
`default: '{}'::jsonb` (migration correctiva).

---

### 🟢 B23 — Sem índice em `audit_logs.correlation_id` — novo

Migration `1740400000000` adiciona a coluna mas **nenhum índice**. Traçar request por
correlationId = seq scan em tabela append-only grande. **Fix:** `CREATE INDEX
IDX_audit_logs_correlation ON audit_logs(correlation_id) WHERE correlation_id IS NOT NULL`.

---

### 🟢 B24 — Sem índice em `sessions(expires_at, revoked_at)` — novo

Purge de sessões expiradas/revogadas (P6) fará seq scan. **Fix:** índice composto
`(expires_at, revoked_at)`.

---

### 🟢 B25 — `MailModule`/`MailService` órfãos — novo

`src/common/mail/*` definidos mas **não importados em nenhum módulo** (grep confirma só a
definição). `resend`/`nest-resend` no `package.json`. **Fix:** integrar (ver F1) ou remover.

---

### 🟢 B26 — `UsersService.findAll/findById/remove` mortos — novo

Sem `UsersController`; `findById`/`findAll`/`remove` não têm consumidores (`JwtStrategy`
usa `findOne`). **Fix:** remover ou criar `UsersController` com guards + paginação + sem
expor `password`.

---

## 3. Compliance e auditoria — novo

### 🟡 C1 — Login sucesso não é auditado

`auth.service.ts:160-162` só audita falha/lock. Eventos de login bem-sucedido não são
registrados — gap de compliance para ambientes regulados (o público-alvo declarado do
template). **Fix:** `auditLogService.log({ action: 'auth.login_success', ... })` em
`createTokensAndSession`.

### 🟡 C2 — AuditInterceptor não captura IP/UA em mutações RBAC

`audit.interceptor.ts:40-56` chama `log({ action, entityType, entityId, metadata })` —
sem `ip`/`userAgent`. Admin actions de RBAC (create/edit/delete role, assign permissions)
ficam sem atribuição de rede. `AuthService` login failure já passa IP/UA — inconsistente.

**Fix:** injetar `RequestContext` + `req.ip`/`req.get('user-agent')` no interceptor.

### 🟡 C3 — `assignPermissions` audit perde `permissionIds`

`role.service.ts:115-153` retorna `void`; `AuditInterceptor.buildMetadata` só captura
`result.permissionIds` (inexistente aqui). A mutação **mais sensível** do RBAC é
auditada sem registrar **quais** permissões foram atribuídas.

**Fix:** capturar `dto.permissionIds` do request body no interceptor, ou o service
retornar `{ permissionIds }`, ou chamar `auditLogService` manualmente com metadata rica.

### 🟢 C4 — `revokeSessionFamilyAndLogReuse` seta `actorUserId = userId`

`auth.service.ts:62`: o "ator" é quem apresentou o token reusado (suspeito), não o
dono. Setar `actorUserId: userId` é enganoso. **Fix:** `actorUserId: null` +
`metadata.suspectedReuse: true`.

---

## 4. Performance

### 🟠 P1 — bcrypt síncrono bloqueia event loop

`auth.service.ts:140` (`compareSync`), `:298`,`:315` (`hashSync`). CPU-intensivo,
bloqueia o loop. **Fix:** `bcrypt.compare`/`bcrypt.hash` async; cost 12.

### 🟡 P2 — DB hit por requisição autenticada

`JwtStrategy` faz `findOne` por request, sem cache. **Fix:** cache de user por `sub`
(TTL curto, invalidado em password/lockout/isActive).

### 🟡 P3 — Health Redis abre novo client a cada probe

`redis.health.ts:24-38`: `createClient`+`connect`+`ping`+`quit` a cada 10s. **Fix:**
reuse singleton (o mesmo `KeyvRedis` após S3); `PING` no client aberto.

### 🟡 P4 — `AuditLogService` insert síncrono + erros engolidos

`audit-log.service.ts:42`: `save` no caminho da response; `try/catch` só loga (perda
silenciosa). **Fix:** fila/buffer + consumidor assíncrono (BullMQ) com retry at-least-once.

### 🟢 P5 — `RoleService.findAll` sem paginação

`role.service.ts:54-60` carrega todas as roles + relações. **Fix:** paginar como
`FeatureService.findAll`.

### 🟡 P6 — Sessões/audit sem purge/retention

`sessions` cresce indefinidamente; `audit_logs` append-only. `@nestjs/schedule` registrado
mas ocioso (P7). **Fix:** cron diário `DELETE FROM sessions WHERE expires_at < now() - interval '1 day'`;
audit particionado mensal + retenção.

### 🟢 P7 — `ScheduleModule` ocioso — novo

`app.module.ts:34` registra `ScheduleModule.forRoot()`, mas só `TasksModule` (morto, B12)
usa `@Cron`. Scheduler rodando sem propósito. **Fix:** remova até ter jobs reais (ex.: purge
P6) ou use-o para esses jobs.

### 🟢 P8 — `DataSource` instanciado em module-load + `dotenv` duplo — novo

`config/database.ts:4` (`dotenv.config()`) carrega `.env` fora do ConfigModule (duplo
load; cwd-dependente). `:27` instancia `new DataSource(dataSourceOptions)` em module-load
— usado só pelo CLI de migrations; no runtime do app aloca um objeto DataSource extra
(confuso + desperdício). **Fix:** separar `dataSourceOptions` (export) do `dataSource`
(só para CLI); remover `dotenv.config()` (ConfigModule já valida).

---

## 5. Infraestrutura / DevOps — novo

### 🔴 I1 — Dockerfile quebrado sem `yarn.lock`

Confirmado: **não existe `yarn.lock`** no repo (só `package-lock.json`). `Dockerfile:20`:
`COPY --from=builder /app/package.json /app/yarn.lock ./` — caminho explícito (não-glob)
de `yarn.lock` inexistente → **COPY falha** → build quebra. Mesmo que chegasse ao
`:21` `yarn install --production --frozen-lockfile` também falharia sem lock.

**Fix:** commitar `yarn.lock` **ou** reescrever o Dockerfile só com npm:
```dockerfile
COPY package.json package-lock.json ./
RUN npm ci
...
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
```

### 🟠 I2 — `setup.sh` apaga README + sync/migration conflitam (já detalhado em Bugs)

### 🟠 I3 — Sem CI (já detalhado)

### 🟠 I4 — Lint conflita (já detalhado)

### 🟢 I5 — Redis/Postgres expostos com creds default

`docker-compose.yml:40-55`: portas 5432/6379 expostas ao host; sem senha Redis;
`DB_PASSWORD` default `postgres`. **Fix:** não expor em prod; `REDIS_PASSWORD` + auth;
senhas via secrets.

---

## 6. Dependências vs. versões recentes (Context7)

| Pacote | No projeto | Veredito |
|--------|-----------|----------|
| `@nestjs/*` | 11.1.13 | OK (v11 corrente). |
| `@nestjs/cache-manager` | ^3.1.0 | **Requer `stores` (Keyv).** `max` inválido. → S3/D1. |
| `cache-manager` | ^7.2.8 | Keyv-based; usar `KeyvRedis`/`KeyvCacheableMemory`. |
| `typeorm` | ^0.3.28 | OK. Habilitar `cache` no DataSource (B2). |
| `@nestjs/jwt` | 11.0.2 | OK. Adicionar `tokenType` (S1). |
| `passport-jwt` | 4.0.1 | OK. |
| `bcryptjs` | ^3.0.3 | OK; usar API **async** (P1); cost 12. |
| `helmet` | ^8.1.0 | OK. |
| `express-rate-limit` | ^8.2.1 | Migrar p/ `@nestjs/throttler` v6 (S6/D2). |
| `@nestjs/throttler` | **ausente** | Adicionar p/ throttling por rota (Context7: `ThrottlerModule.forRoot` + `APP_GUARD` + `@Throttle` + `getTracker`). |
| `redis` | ^5.10.0 | OK; reuse no cache (S3) e health (P3). |
| `nestjs-pino` | ^4.5.0 | OK; remover `LoggerService` (B14). |
| `@nestjs/terminus` | ^11.0.0 | OK. |
| `class-validator`/`class-transformer` | 0.14/0.5 | OK; **cuidado** com `@Type(() => Boolean)` + `enableImplicitConversion` (footgun `Boolean('false')===true`). |
| `@nestjs/schedule` | 6.1.1 | Ocioso (P7); usar p/ purge (P6) ou remover. |
| `nest-resend`/`resend` | ^3.1.0/^6.9.2 | Presentes mas `MailModule` órfão (B25/D5). |

### D2 — `@nestjs/throttler` v6

Context7: `ThrottlerModule.forRoot([{ ttl: seconds(60), limit }])` + `APP_GUARD ThrottlerGuard`
+ `@Throttle({ default: { limit, ttl, getTracker } })`. Permite throttler estrito por
endpoint (login) e tracker por email. Substitui `express-rate-limit` via `app.use()`.

### D3 — Global prefix

`main.ts` não chama `setGlobalPrefix`; docs/insomnia esperam `api`. Decidir e alinhar.

### D4 — Password policy inconsistente

`RegisterDto` `MinLength(6)` × `ChangePasswordDto` `MinLength(8)`, sem complexidade.
**Fix:** regex mínimo `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$` (ou `zxcvbn`) igual p/ ambos.

### D5 — `MailModule` não integrado

Ver B25 / F1.

---

## 7. Oportunidades de novos recursos — novo

| ID | Recurso | Justificativa | Base existente |
|----|---------|---------------|-----------------|
| F1 | **Verificação de email + reset de senha** | Registro cria usuário ativo sem verificação; sem fluxo de reset. Compliance/UX. | `MailModule`/`MailService` + `resend` já no deps (órfãos). |
| F2 | **Logout / logout-all + `jti` denylist** | Sem revogação hoje (S9). | `Session` entity já existe; Redis (após S3). |
| F3 | **Detecção de anomalia IP/UA em refresh** | `sessions.ip`/`userAgent` já gravados mas não validados em rotação. Alertar/step-up em IP novo. | `session.entity.ts`. |
| F4 | **Histórico de senhas + política de rotação** | `changePassword` aceita reusar senha. Compliance (HIPAA/PCI). | Novo. |
| F5 | **Guard global default-deny + `@Public()`** | Auth opt-in por controller é arriscado (S10). | `JwtAuthGuard`/`PermissionGuard` existentes. |
| F6 | **Multi-tenant real ou remoção** | `Organizations` placeholder + `AuditLog.organization_id` yagni (B19). | `Organization` entity. |
| F7 | **Audit assíncrono via fila + retenção/particionamento** | Insert síncrono + perda silenciosa + crescimento ilimitado (P4/P6). | `AuditLog` entity. |
| F8 | **Health: indicadores de Redis-cache + keypair** | Readiness só checa DB+Redis(conectividade), não se cache/chaves estão saudáveis. | `@nestjs/terminus`. |
| F9 | **OpenTelemetry + métricas Prometheus** | Observabilidade hoje é só Pino logs; sem traces/metrics. Alinhado ao pitch "AI integrations require structured observability". | Novo. |
| F10 | **Gerenciamento de sessões/dispositivos** | Usuário não vê nem revoga sessões ativas. | `sessions` table rica. |
| F11 | **MFA/TOTP step-up** | Operações sensíveis (assign_permissions, change role) sem step-up. | Novo. |
| F12 | **Feature flags** | `Feature` entity existe só p/ RBAC; poderia amarrar flags de rollout. | `Feature` entity. |

---

## 8. Roadmap priorizado (v2)

### P0 — Críticas (esta sprint)
1. **S1** — `tokenType` claim + rejeição cruzada access/refresh.
2. **S2** — `currentPassword` em `changePassword` (reautenticação).
3. **S3/D1** — `CacheModule` global com `KeyvRedis`; corrigir README/docs.
4. **I1** — Corrigir Dockerfile (commitar `yarn.lock` ou migrar para npm ci).
5. **B1 + B21** — Corrigir specs quebrados (`auth.service.spec`, `app.controller.spec`).

### P1 — Altas (próxima sprint)
6. **S4** — `ensureNotLocked` em `refresh`.
7. **S5** — DB SSL com CA + `rejectUnauthorized:true` em prod.
8. **S6/D2** — `@nestjs/throttler`; throttler estrito em `/auth/login` por IP+email.
9. **S7** — `select` sem `password` em `findOne`/strategy.
10. **S9/F2** — `logout`/`logout-all` + `jti` denylist.
11. **S10/F5** — Guard global default-deny + `@Public()`.
12. **S11** — Refresh atômico (transação + pessimistic lock).
13. **B2** — `cache` no DataSource TypeORM ou remover `cache:` das queries.
14. **B3** — Atribuir role no register (default ou explícita).
15. **P1** — bcrypt async + cost 12.
16. **I3** — CI (lint + test + e2e com Testcontainers + npm audit).
17. **I4** — Corrigir conflitos de lint.

### P2 — Médias (backlog)
18. **B4** — Soft-delete vs unique (partial index ou hard delete).
19. **B5** — Implementar deny ou remover `granted`.
20. **B6/B8** — Revogação por família (recursive CTE) ou remover dead code.
21. **B9/P2** — `JwtStrategy` por `sub` + cache de user.
22. **B16/B17** — Invalidação de cache em mutações Feature/Permission (+ bloquear rename de `action`).
23. **B11** — Remover `GET /premium-echo`.
24. **B12/B13/B14/B25/B26** — Limpar dead code (`tasks`, `endpoints.json`, `LoggerService`, `MailModule` órfão, métodos mortos).
25. **B22** — Migration correctiva de índices (alinhamento entidade/migration).
26. **C1/C2/C3/C4** — Compliance do audit (login sucesso, IP/UA, permissionIds, actor correto).
27. **P3/P4** — Health Redis reusando client; audit assíncrono (fila).
28. **P6** — Cron de purge de sessões + retenção de audit.
29. **D4** — Password policy consistente + complexidade.
30. **S12** — Fail-fast de chaves em todos ambientes.
31. **B19/F6** — Decidir multi-tenant ou remover `organization_id` do audit.

### P3 — Baixas (polimento)
32. **B7, B10, B15, B18, B23, B24, P5, P7, P8, I5, D3** — Ajustes finos.
33. **F1, F3, F4, F8, F9, F10, F11, F12** — Oportunidades de produto/observabilidade.

---

## 9. Notas metodológicas e limites

- **Context7**: API `CacheModule` NestJS v11 (Keyv/stores), query cache TypeORM,
  `@nestjs/throttler` v6, `setGlobalPrefix`. Source reputation: High.
- **Sequential Thinking**: decomposição + revisão de hipóteses (ramo de crítica à v1).
- **SuperPowers — verification-before-completion**: re-checkei fatos (ausência de
  `yarn.lock`, `getEcho` inexistente, `MailModule` órfão, `.github` ausente) antes de afirmar.
- **Não executado**: código, testes, SAST dinâmico, fuzzing, review de segredos no git
  history. Recomenda-se `npm audit --omit=dev`, `npm outdated`, `npm ls`, e adicionar
  `npm-audit` + `tsc --noEmit` ao CI.
- **Limitação**: severidades são julgamentos; ajuste ao seu contexto de ameaça. Itens
  marcados "latente" (S7, B16) só se manifestam sob condições indicadas.

---

*v2 — Total: 4 críticas, 9 altas, ~18 médias, ~17 baixas + 12 oportunidades de recursos.
Próximo passo: executar P0 em branch isolada com TDD por item, validando cada fix com
teste que reproduz o achado antes da correção (SuperPowers — test-driven-development).*
