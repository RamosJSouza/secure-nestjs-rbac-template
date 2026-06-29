# P2-B — Infra, Retention & Async Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deferred P2 items: **P4** (async audit via BullMQ), **P6** (daily session purge + 90-day audit retention), **B19** (remove Organizations placeholder + `organization_id`), **P8** (split TypeORM options from CLI DataSource + eliminate double dotenv on Nest boot).

**Architecture:** Branch `p2-b-infra-retention` off `p2-a-medium-priority`. TDD per task (red → green → commit). Order: P8 first (no deps), B19 second (clean audit schema before async jobs), P4 third (BullMQ reuses `REDIS_HOST`/`REDIS_PORT`), P6 fourth (re-add `@nestjs/schedule` for purge crons). Audit jobs carry **fully-resolved** context (ALS captured at enqueue). When `REDIS_HOST` is unset, audit falls back to synchronous `save` (dev/test parity with current cache behavior).

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, Redis (Keyv + BullMQ), `@nestjs/bullmq`, `bullmq`, `@nestjs/schedule`. Shell is **PowerShell** — chain with `;`, never `&&`; never bash heredocs.

**User decisions (locked):**
- P4: BullMQ + worker
- P6: Daily session purge + audit 90 days
- B19: Remove `organization_id` / placeholder (not implement multi-tenant)
- Scope: P4 + P6 + B19 + P8

---

## Baseline & Conventions

- Baseline before Task 1: `npm test` 98/98, `npm run lint` exit 0, `npx tsc --noEmit` clean. HEAD `9751748` on `p2-b-infra-retention`.
- New migrations use timestamps **>= `1740500000000`** (last is `1740400000004`).
- TDD: failing test → implement → full gates → NEW commit (never amend).
- Comments: no `//` narrative comments. JSDoc `/** */` and Swagger `@Api*` only.
- After each task: `npm test`, `npm run lint`, `npx tsc --noEmit` green before commit.

---

## File Structure (create / modify)

**Create:**
- `src/config/database.options.ts`
- `src/config/typeorm.datasource.ts`
- `src/migrations/1740500000000-RemoveOrganizationFromAudit.ts`
- `src/migrations/1740500000001-AuditLogsCreatedAtIndex.ts` (optional perf for P6 purge)
- `src/modules/audit/audit-queue.constants.ts`
- `src/modules/audit/audit-log.processor.ts`
- `src/modules/audit/audit-log.service.spec.ts`
- `src/modules/audit/audit-log.processor.spec.ts`
- `src/config/redis-connection.factory.ts`
- `src/modules/maintenance/maintenance.module.ts`
- `src/modules/maintenance/purge.service.ts`
- `src/modules/maintenance/purge.service.spec.ts`

**Modify:**
- `package.json` (deps + TypeORM `-d` path)
- `src/config/database.ts` → thin re-export or delete
- `src/config/index.ts`
- `src/migrations/seeds/run-seed.ts`
- `test/app.e2e-spec.ts`
- `src/app.module.ts` (BullModule, ScheduleModule, MaintenanceModule; remove OrganizationsModule)
- `src/modules/audit/audit-log.service.ts`, `audit.module.ts`
- `src/modules/audit/entities/audit-log.entity.ts`
- `src/logger/request-context.ts`, `logger.module.ts`
- `src/config/validation.schema.ts`, `validation.schema.spec.ts`, `.env.example`
- `src/graceful-shutdown/graceful-shutdown.service.ts`

**Delete:**
- `src/modules/organizations/` (2 files)

---

## Task 1: P8 — Split database options from CLI DataSource

**Files:**
- Create: `src/config/database.options.ts`, `src/config/typeorm.datasource.ts`
- Modify: `src/config/index.ts`, `package.json` (migration scripts `-d`), `src/migrations/seeds/run-seed.ts`, `test/app.e2e-spec.ts`
- Modify: `src/config/database.ts` → re-export only (backward compat for any external refs)

- [ ] **Step 1: Create `database.options.ts` (pure, no side effects)**

```typescript
import { DataSourceOptions } from 'typeorm';

export function buildDataSourceOptions(): DataSourceOptions {
  if (
    process.env.DB_SSL === 'true' &&
    process.env.NODE_ENV === 'production' &&
    !process.env.DB_SSL_CA
  ) {
    throw new Error(
      'DB_SSL_CA is required when DB_SSL=true and NODE_ENV=production (refusing to connect with unverified server certificate)',
    );
  }

  return {
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    synchronize:
      process.env.NODE_ENV !== 'production' &&
      (process.env.NODE_ENV === 'development' || process.env.DB_SYNCHRONIZE === 'true'),
    logging: process.env.DB_LOGGING === 'true',
    ssl:
      process.env.DB_SSL === 'true'
        ? { ca: process.env.DB_SSL_CA, rejectUnauthorized: true }
        : false,
    extra: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  };
}

/** @deprecated import buildDataSourceOptions instead */
export const dataSourceOptions = buildDataSourceOptions();
```

- [ ] **Step 2: Create `typeorm.datasource.ts` (CLI entrypoint only)**

```typescript
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { buildDataSourceOptions } from './database.options';

dotenv.config();

export default new DataSource(buildDataSourceOptions());
```

- [ ] **Step 3: Update consumers**

`src/config/index.ts`:
```typescript
import { buildDataSourceOptions } from './database.options';
// ...
database: buildDataSourceOptions(),
```

`src/config/database.ts` (thin shim):
```typescript
export { buildDataSourceOptions, dataSourceOptions } from './database.options';
export { default } from './typeorm.datasource';
```

`package.json` scripts: change all `-d src/config/database.ts` → `-d src/config/typeorm.datasource.ts`.

`run-seed.ts`: `import dataSource from '../../config/typeorm.datasource';`

`test/app.e2e-spec.ts`: dynamic import `buildDataSourceOptions` from `database.options` (not `database.ts`).

- [ ] **Step 4: Gates + commit**

```powershell
npm test; npm run lint; npx tsc --noEmit
git add src/config/ package.json src/migrations/seeds/run-seed.ts test/app.e2e-spec.ts
git commit -m "refactor(config): split TypeORM options from CLI DataSource (P8)"
```

---

## Task 2: B19 — Remove Organizations placeholder + `organization_id`

**Files:**
- Create: `src/migrations/1740500000000-RemoveOrganizationFromAudit.ts`
- Delete: `src/modules/organizations/` (entire folder)
- Modify: `src/app.module.ts`, `audit-log.entity.ts`, `audit-log.service.ts`, `request-context.ts`, `logger.module.ts`

- [ ] **Step 1: Write failing test** — create `src/modules/audit/audit-log.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { RequestContext } from '@/logger/request-context';

describe('AuditLogService (B19)', () => {
  it('persists audit log without organizationId field', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockImplementation((dto) => dto);
    const module = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: { create, save } },
      ],
    }).compile();
    const service = module.get(AuditLogService);
    await RequestContext.run({ correlationId: 'c1', userId: 'u1' }, async () => {
      await service.log({ action: 'test.action', entityType: 'User', entityId: 'u1' });
    });
    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ organizationId: expect.anything() }),
    );
  });
});
```

(Adapt if Task 3 already changed `log` to enqueue — run B19 before P4 or mock queue.)

- [ ] **Step 2: Migration `1740500000000-RemoveOrganizationFromAudit.ts`**

`up`: drop FK on `audit_logs.organization_id`, drop `IDX_audit_logs_org_created`, drop column, drop `organizations` table + index.

`down`: recreate `organizations` table, column, index, FK (mirror historical migrations).

- [ ] **Step 3: Entity + service + context cleanup**

Remove from `audit-log.entity.ts`: `organizationId`, `organization` relation, `@Index(['organizationId', 'createdAt'])`.

Remove from `AuditLogEntry` and `log()`: `organizationId` line.

`request-context.ts`: remove `organizationId` from interface, remove `getOrganizationId()`, simplify `setUser(userId: string)` (drop 2nd param).

`logger.module.ts`: remove `organizationId` from `customProps`.

`app.module.ts`: remove `OrganizationsModule` import.

Delete `src/modules/organizations/`.

- [ ] **Step 4: Gates + commit**

```powershell
git add -A
git commit -m "refactor(audit): remove Organizations placeholder and organization_id (B19)"
```

---

## Task 3: P4 — BullMQ wiring + Redis connection factory

**Files:**
- Create: `src/config/redis-connection.factory.ts`, `src/modules/audit/audit-queue.constants.ts`
- Modify: `package.json`, `src/app.module.ts`, `src/config/validation.schema.ts`, `.env.example`

- [ ] **Step 1: Install deps**

```powershell
npm install @nestjs/bullmq bullmq
```

- [ ] **Step 2: `redis-connection.factory.ts`**

```typescript
import { ConfigService } from '@nestjs/config';

export function buildRedisConnectionOptions(configService: ConfigService): {
  host: string;
  port: number;
} | null {
  const host = configService.get<string>('REDIS_HOST');
  if (!host) return null;
  const port = Number(configService.get<string | number>('REDIS_PORT')) || 6379;
  return { host, port };
}
```

- [ ] **Step 3: `audit-queue.constants.ts`**

```typescript
export const AUDIT_LOG_QUEUE = 'audit-log';
export const AUDIT_LOG_JOB = 'persist';
```

- [ ] **Step 4: Wire `BullModule.forRootAsync` in `app.module.ts`**

Only register Bull when Redis configured; use `connection: { host, port }` from factory. If no Redis, skip Bull root (audit will sync-fallback in Task 4).

```typescript
BullModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const conn = buildRedisConnectionOptions(configService);
    if (!conn) return { connection: { host: '127.0.0.1', port: 6379, lazyConnect: true, maxRetriesPerRequest: null } };
    return { connection: { ...conn, maxRetriesPerRequest: null } };
  },
}),
```

⚠️ Implementer: use `@nestjs/bullmq` docs — when Redis absent, `AuditModule` must NOT register queue (conditional dynamic module or `BullModule.registerQueue` only when `REDIS_HOST` set). Prefer **conditional import** pattern: export `AuditModule.register()` factory or split `AuditQueueModule` imported only when Redis present. Simpler approach: **require REDIS_HOST in production** via Joi; in dev/test allow sync fallback without Bull.

- [ ] **Step 5: Joi — optional `REDIS_HOST` with note in `.env.example`**

- [ ] **Step 6: Gates + commit**

```powershell
git commit -m "feat(infra): add BullMQ root wiring and Redis connection factory (P4)"
```

---

## Task 4: P4 — Async audit processor + service enqueue

**Files:**
- Create: `src/modules/audit/audit-log.processor.ts`
- Modify: `src/modules/audit/audit-log.service.ts`, `audit.module.ts`
- Create: `audit-log.service.spec.ts` (extend), `audit-log.processor.spec.ts`

**Job payload (ALS resolved at enqueue):**

```typescript
export interface AuditLogJobPayload {
  action: string;
  entityType: string;
  entityId?: string;
  actorUserId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}
```

- [ ] **Step 1: Failing test — enqueue when queue available**

```typescript
it('enqueues audit job with resolved context when queue is injected', async () => {
  const add = jest.fn().mockResolvedValue(undefined);
  // provider with mock Queue + REDIS available flag
  await service.log({ action: 'auth.login_success', entityType: 'User', entityId: 'u1', actorUserId: 'u1' });
  expect(add).toHaveBeenCalledWith(AUDIT_LOG_JOB, expect.objectContaining({ action: 'auth.login_success', actorUserId: 'u1' }));
});
```

- [ ] **Step 2: `AuditLogProcessor`**

```typescript
@Processor(AUDIT_LOG_QUEUE)
export class AuditLogProcessor extends WorkerHost {
  constructor(@InjectRepository(AuditLog) private repo: Repository<AuditLog>) { super(); }

  async process(job: Job<AuditLogJobPayload>): Promise<void> {
    const entry = job.data;
    const auditLog = this.repo.create({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      actorUserId: entry.actorUserId ?? null,
      correlationId: entry.correlationId ?? null,
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
    await this.repo.save(auditLog);
  }
}
```

- [ ] **Step 3: Refactor `AuditLogService.log`**

Resolve ALS **before** enqueue:
```typescript
const payload: AuditLogJobPayload = {
  action: entry.action,
  entityType: entry.entityType,
  entityId: entry.entityId,
  actorUserId: entry.actorUserId === undefined ? RequestContext.getUserId() : entry.actorUserId,
  correlationId: entry.correlationId ?? RequestContext.getCorrelationId() ?? null,
  metadata: entry.metadata ?? {},
  ip: entry.ip ?? null,
  userAgent: entry.userAgent ?? null,
};
if (this.auditQueue) {
  await this.auditQueue.add(AUDIT_LOG_JOB, payload, { removeOnComplete: 1000, attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
  return;
}
// sync fallback (no Redis)
await this.persistSync(payload);
```

Extract `persistSync` from current `save` logic (used by fallback + processor).

- [ ] **Step 4: `audit.module.ts`** — register queue + processor when Redis configured.

- [ ] **Step 5: Processor spec + service specs; gates; commit**

```powershell
git commit -m "feat(audit): async audit persistence via BullMQ with sync fallback (P4)"
```

---

## Task 5: P4 — Graceful shutdown for BullMQ queue

**Files:**
- Modify: `src/graceful-shutdown/graceful-shutdown.service.ts`, `graceful-shutdown.module.ts`

- [ ] **Step 1: Inject `Queue` (optional) or use `getQueueToken(AUDIT_LOG_QUEUE)`**

On shutdown: `await queue.close()` before DB destroy (within existing 10s timeout).

- [ ] **Step 2: Gates + commit**

```powershell
git commit -m "feat(shutdown): close BullMQ audit queue on application shutdown (P4)"
```

---

## Task 6: P6 — Schedule module + maintenance env vars

**Files:**
- Modify: `package.json`, `src/app.module.ts`, `validation.schema.ts`, `validation.schema.spec.ts`, `.env.example`, `src/config/index.ts`

- [ ] **Step 1: Reinstall `@nestjs/schedule`**

```powershell
npm install @nestjs/schedule
```

- [ ] **Step 2: Add env vars with Joi defaults**

```
PURGE_ENABLED=true
SESSION_PURGE_CRON=0 3 * * *
SESSION_GRACE_DAYS=1
AUDIT_RETENTION_DAYS=90
AUDIT_PURGE_CRON=0 4 * * *
PURGE_BATCH_SIZE=1000
```

- [ ] **Step 3: `ScheduleModule.forRoot()` in `app.module.ts`**

- [ ] **Step 4: validation.schema.spec.ts — test defaults**

- [ ] **Step 5: Gates + commit**

```powershell
git commit -m "feat(maintenance): add schedule module and purge env configuration (P6)"
```

---

## Task 7: P6 — PurgeService (sessions + audit retention)

**Files:**
- Create: `maintenance.module.ts`, `purge.service.ts`, `purge.service.spec.ts`
- Optional migration: `1740500000001-AuditLogsCreatedAtIndex.ts`

- [ ] **Step 1: Failing tests**

```typescript
it('deletes expired sessions past grace period in batches', async () => { ... });
it('deletes audit logs older than AUDIT_RETENTION_DAYS', async () => { ... });
it('skips purge when PURGE_ENABLED=false', async () => { ... });
```

- [ ] **Step 2: `PurgeService`**

Session purge SQL (uses `IDX_sessions_expires_revoked`):
```typescript
await this.sessionRepo
  .createQueryBuilder()
  .delete()
  .where('id IN (SELECT id FROM sessions WHERE expires_at < :cutoff LIMIT :batch)', { cutoff, batch })
  .execute();
```

Audit purge:
```typescript
const cutoff = subDays(new Date(), retentionDays);
await this.auditRepo
  .createQueryBuilder()
  .delete()
  .where('"createdAt" < :cutoff', { cutoff })
  .execute();
```

Use batched loops until `affected < batch` or `PURGE_ENABLED` false. `@Cron` decorators call package-private `runSessionPurge()` / `runAuditPurge()` (testable).

- [ ] **Step 3: Import `MaintenanceModule` in `AppModule`**

- [ ] **Step 4: Optional migration** — `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs" ("createdAt")` for large-table DELETE performance.

- [ ] **Step 5: Gates + commit**

```powershell
git commit -m "feat(maintenance): daily session purge and 90-day audit retention (P6)"
```

---

## Task 8: Docs alignment (minimal)

**Files:** `CLAUDE.md`, `README.md` (only if they mention OrganizationsModule)

- [ ] Remove `OrganizationsModule` from active modules list; note BullMQ audit requires Redis in production; document purge env vars.

```powershell
git commit -m "docs: align module list and maintenance env vars (P2-B)"
```

---

## Self-Review

| Spec item | Task |
|-----------|------|
| P8 | Task 1 |
| B19 | Task 2 |
| P4 BullMQ | Tasks 3–5 |
| P6 purge + 90d | Tasks 6–7 |
| Docs | Task 8 |

**Ordering:** Task 2 before Task 4 (job payload has no `organizationId`). Task 1 independent. Task 6 before Task 7.

**Redis without host:** sync audit fallback preserves dev-without-Redis; production should set `REDIS_HOST` (docker-compose already does).

**Deferred:** multi-tenant (B19 removes placeholder), audit partitioning (user chose 90d simple DELETE not monthly partitions).
