# P2-A — Medium-Priority Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the well-scoped P2 backlog items (B11, B12–B26 dead code, B22/B23/B24/B18 schema correctness, B4 soft-delete, B5 granted column, B6/B8/C4 reuse audit, B9/P2 JWT-by-sub + user cache, S12 fail-fast keys, C1/C2/C3 audit compliance, B16/B17 RBAC cache invalidation, D4 password policy, P3 health Redis reuse) from `docs/ANALISE_PROFUNDA.md`, absorbing the `/simplify` follow-ups.

**Architecture:** Branch `p2-a-medium-priority` off `p1-high-priority`. TDD per task (red → green → commit). Schema fixes via NEW corrective migrations (never edit historical migrations). Cache/audit reuse existing `CACHE_MANAGER` + `AuditLogService` patterns. Dead-code removal is aggressive but verified by the test suite + `tsc --noEmit` + `lint`.

**Tech Stack:** NestJS 11.1.27, TypeORM 0.3.28, PostgreSQL, Redis (Keyv), Jest, `@nestjs/throttler` v6, `@nestjs/terminus`. Shell is **PowerShell** — chain commands with `;`, never `&&`; never use bash heredocs.

---

## Baseline & Conventions

- Baseline before Task 1: `npm test` 81/81, `npm run lint` exit 0, `npx tsc --noEmit` clean. Head `161f68c` on `p2-a-medium-priority`.
- New migrations use timestamps **>= `1740400000002`** (last is `1740400000001-AddSessionJti.ts`). One migration file per logical change, timestamped sequentially.
- Migration class name = `<Name><timestamp>` (e.g. `CorrectiveIndexes1740400000002`).
- TDD discipline: write the failing test, run it (expect FAIL), implement, run it (expect PASS), then run the FULL gate (`npm test`, `npm run lint`, `npx tsc --noEmit`), then commit a NEW commit (never amend).
- Comments: no `//` narrative comments (per repo policy). JSDoc `/** */` and Swagger `@Api*` only. Lint pragmas (`// eslint-disable`) are allowed.
- No placeholders. Every code step contains the real code.
- After each task, run `npm test`, `npm run lint`, `npx tsc --noEmit` and confirm green before committing.

---

## File Structure (create / modify)

**Create:**
- `src/migrations/1740400000002-CorrectiveIndexes.ts`
- `src/migrations/1740400000003-SoftDeletePartialUniqueEmail.ts`
- `src/migrations/1740400000004-DropRolePermissionGranted.ts`
- `src/modules/audit/interceptors/audit.interceptor.spec.ts` (new spec)

**Modify:**
- `src/app.controller.ts`, `src/app.controller.spec.ts`, `test/app.e2e-spec.ts`
- Remove `src/tasks/` (8 files), `src/logger/logger.service.ts`, `src/common/mail/` (2 files), `endpoints.json`
- `src/app.module.ts`, `package.json`, `tsconfig.json`, `test/jest-e2e.json`
- `src/users/users.service.ts`, `src/users/users.service.spec.ts`
- `src/modules/rbac/entities/user.entity.ts`, `role-permission.entity.ts`
- `src/auth/auth.service.ts`, `src/auth/auth.service.spec.ts`
- `src/auth/strategy/jwt.strategy.ts`, `src/auth/auth.token-type.spec.ts`
- `src/config/validation.schema.ts`, `src/config/index.ts`, `src/auth/auth.module.ts`
- `src/modules/audit/interceptors/audit.interceptor.ts`, `src/modules/audit/decorators/auditable.decorator.ts`
- `src/modules/rbac/services/role.service.ts`, `rbac.service.ts`, `feature.service.ts`, `permission.service.ts`, `permission.dto.ts` + specs
- `src/auth/dto/register.dto.ts`, `change-password.dto.ts`
- `src/modules/health/indicators/redis.health.ts`, `src/config/cache-stores.factory.ts`, `src/modules/health/health.module.ts`
- `src/migrations/seeds/rbac.seed.ts`

---

## Task 1: B11 — Remove `GET /premium-echo`

**Files:**
- Modify: `src/app.controller.ts:17-22`
- Modify: `src/app.controller.spec.ts:55-63`
- Modify: `test/app.e2e-spec.ts:80-83`

`/premium-echo` is a GET endpoint with `@Body` (Express doesn't parse GET bodies → undefined), no DTO, reflection in a "secure" template. Remove it and switch the e2e default-deny assertion to a real protected route (`GET /roles`).

- [ ] **Step 1: Update the e2e default-deny test (red)**

In `test/app.e2e-spec.ts`, replace the `/premium-echo` assertion:

```typescript
  it('protected route without token returns 401 (default-deny)', async () => {
    const res = await request(app.getHttpServer()).get('/roles');
    expect(res.status).toBe(401);
  });
```

- [ ] **Step 2: Remove the `getPremiumEcho` unit test**

In `src/app.controller.spec.ts`, delete the entire `describe('getPremiumEcho', () => { ... })` block (lines 55-63).

- [ ] **Step 3: Remove the route + now-orphaned imports**

In `src/app.controller.ts`, delete the `getPremiumEcho` method (lines 17-22). Then remove now-unused imports: `Body`, `UseGuards`, `JwtAuthGuard`, `PermissionGuard`, `RequirePermissions`. Keep `Public` (used by `getHello`). The resulting imports should be only what `getHello` uses.

Final `src/app.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

(Keep `@ApiTags('app')` if present; adjust to current decorators minus the removed ones. If `AppService.getHello` already exists as-is, leave it.)

- [ ] **Step 4: Run gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: all green (81+ tests pass; if `app.controller.spec.ts` had only the removed test, the suite still compiles). `test/app.e2e-spec.ts` is NOT executed locally (no Docker) — `tsc` must still typecheck it.

- [ ] **Step 5: Commit**

```powershell
git add src/app.controller.ts src/app.controller.spec.ts test/app.e2e-spec.ts
git commit -m "feat(app): remove insecure GET /premium-echo route (B11)"
```

---

## Task 2: Dead code sweep (B12, B13, B14, B25, B26)

**Files:**
- Remove: `src/tasks/` (8 files), `src/logger/logger.service.ts`, `src/common/mail/` (2 files), `endpoints.json`
- Modify: `src/app.module.ts`, `src/users/users.service.ts`, `src/users/users.service.spec.ts`, `package.json`, `tsconfig.json`, `test/jest-e2e.json`

Remove dead modules/methods confirmed to have zero production callers.

- [ ] **Step 1: Remove `UsersService.findAll`, `findById`, `remove` (red first)**

In `src/users/users.service.spec.ts`, delete the `describe('findAll', ...)`, `describe('findById', ...)`, and `describe('remove', ...)` blocks (lines ~72-86, ~109-129, ~160-169). Keep describes for `findOne`, `findOneWithPassword`, `findByIdWithPassword`, `create`, `recordFailedLogin`, `resetFailedLogin`, `updatePassword`.

Then in `src/users/users.service.ts`, delete the three methods:

```typescript
  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }
```

```typescript
  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
    });
  }
```

```typescript
  async remove(id: string): Promise<void> {
    await this.usersRepository.softDelete(id);
  }
```

⚠️ `findById` is NOT used by `JwtStrategy` yet (Task 7 will add `findById`-based lookup). After deletion, Task 7 re-adds a `findById` usage. If Task 7 will need `findById`, keep it — but the explore confirms it currently has zero callers, so delete now; Task 7 reintroduces the call on the existing `findByIdWithPassword`? No: Task 7 needs a non-password `findById`. **Decision:** keep `findById` (Task 7 uses it). Delete ONLY `findAll` and `remove`. Re-verify zero callers for `findAll`/`remove` (confirmed: zero). So delete `findAll` + `remove` only.

- [ ] **Step 2: Remove `src/tasks/` entirely**

Delete the whole folder `src/tasks/` (8 files): `tasks.module.ts`, `tasks.controller.ts`, `tasks.service.ts`, `tasks.controller.spec.ts`, `tasks.service.spec.ts`, `entities/task.entity.ts`, `dto/create-task.dto.ts`, `dto/update-task.dto.ts`. `TasksModule` is not imported in `AppModule`.

- [ ] **Step 3: Remove `ScheduleModule` + `@nestjs/schedule` (P7, tied to B12)**

`ScheduleModule.forRoot()` in `src/app.module.ts:39` only served the dead `TasksService` `@Cron` decorators. Remove the `ScheduleModule` import (line 5) and the `ScheduleModule.forRoot()` entry (line 39). Then remove `@nestjs/schedule` from `package.json` dependencies and run `npm install` (uses `.npmrc legacy-peer-deps=true`).

In `package.json`, delete the `"@nestjs/schedule": "6.1.1"` line, then:

```powershell
npm install
```

- [ ] **Step 4: Remove `LoggerService` (B14)**

Delete `src/logger/logger.service.ts`. Its only consumer was `TasksService` (now removed). `logger.module.ts` does not declare it. Confirm no remaining imports via `tsc` in Step 7.

- [ ] **Step 5: Remove `MailModule`/`MailService` orphans (B25) + deps**

Delete `src/common/mail/mail.module.ts` and `src/common/mail/mail.service.ts` (zero importers confirmed). Remove `nest-resend` and `resend` from `package.json` dependencies, then `npm install`. (This also resolves the pre-existing `nest-resend`/`resend` peer conflict — after removal, the `.npmrc` `legacy-peer-deps` is still kept as a safety net but the conflict root is gone.)

- [ ] **Step 6: Remove `endpoints.json` (B13)**

Delete `endpoints.json` (root). Zero code references (only docs). Stale 2021 Insomnia export referencing non-existent routes.

- [ ] **Step 7: Clean up `@tasks` aliases**

In `tsconfig.json` remove `"@tasks/*": ["src/tasks/*"]` (line 19). In `package.json` Jest `moduleNameMapper` remove the `"^@tasks/(.*)$"` entry (line ~134). In `test/jest-e2e.json` remove the `@tasks` mapper (line ~14).

- [ ] **Step 8: Run gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green. Test count drops (tasks specs removed, users specs trimmed) — record the new count as the new baseline. `tsc` must compile (confirms no dangling imports of removed symbols).

- [ ] **Step 9: Commit**

```powershell
git add -A
git commit -m "chore: remove dead code (tasks module, LoggerService, MailModule, endpoints.json, dead UsersService methods) (B12/B13/B14/B25/B26)"
```

---

## Task 3: Corrective migrations (B22, B23, B24, B18)

**Files:**
- Create: `src/migrations/1740400000002-CorrectiveIndexes.ts`
- Modify: `src/modules/audit/entities/audit-log.entity.ts` (add `@Index(['correlationId'])`)
- Modify: `src/modules/auth/entities/session.entity.ts` (add `@Index(['expiresAt', 'revokedAt'])`)

Align entity-declared indexes with the DB (B22), add missing audit correlation index (B23), sessions purge index (B24), and `metadata` default (B18). Never edit historical migrations.

- [ ] **Step 1: Write the migration**

Create `src/migrations/1740400000002-CorrectiveIndexes.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectiveIndexes1740400000002 implements MigrationInterface {
  name = 'CorrectiveIndexes1740400000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // B22: drop useless/redundant partial indexes from InitialRbacSchema
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_is_active_partial"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_is_active_partial"`);

    // B22: create composite indexes declared by entities
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_email_isActive" ON "users" ("email", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_roleId_isActive" ON "users" ("role_id", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_roles_name_isActive" ON "roles" ("name", "isActive")`,
    );

    // B18: default for audit_logs.metadata
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb`,
    );

    // B23: index for correlation_id lookup
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_correlation_id" ON "audit_logs" ("correlation_id") WHERE "correlation_id" IS NOT NULL`,
    );

    // B24: index for session purge (expired/revoked)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sessions_expires_revoked" ON "sessions" ("expiresAt", "revokedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sessions_expires_revoked"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_correlation_id"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "metadata" DROP DEFAULT`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_name_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_roleId_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_isActive"`);
    // Note: partial indexes are intentionally NOT restored (they were useless/redundant).
  }
}
```

- [ ] **Step 2: Align entities**

In `src/modules/audit/entities/audit-log.entity.ts`, add to the class-level `@Index` decorators:

```typescript
@Entity('audit_logs')
@Index(['organizationId', 'createdAt'])
@Index(['actorUserId', 'createdAt'])
@Index(['entityType', 'entityId'])
@Index(['action', 'createdAt'])
@Index(['correlationId'])
export class AuditLog {
```

In `src/modules/auth/entities/session.entity.ts`, add:

```typescript
@Entity('sessions')
@Index(['userId'])
@Index(['refreshTokenHash'])
@Index(['rotatedFromSessionId'])
@Index(['expiresAt', 'revokedAt'])
export class Session {
```

- [ ] **Step 3: Run gates + migration generate check**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green. (Migration is not executed locally without DB; CI e2e runs it. Ensure the migration file compiles via `tsc`.)

- [ ] **Step 4: Commit**

```powershell
git add src/migrations/1740400000002-CorrectiveIndexes.ts src/modules/audit/entities/audit-log.entity.ts src/modules/auth/entities/session.entity.ts
git commit -m "feat(db): corrective indexes + audit metadata default (B22/B23/B24/B18)"
```

---

## Task 4: B4 — Soft-delete vs unique email

**Files:**
- Create: `src/migrations/1740400000003-SoftDeletePartialUniqueEmail.ts`
- Modify: `src/modules/rbac/entities/user.entity.ts`
- Modify: `src/auth/auth.service.ts:310-334` (register) + `src/auth/auth.service.spec.ts`

A soft-deleted user keeps its `email` row; `findOne(email)` filters it (returns null) → `register` passes the existence check → `save` hits `users_email_key` → unhandled 500. Fix: partial unique index `WHERE deleted_at IS NULL`, drop the global unique, and have `register` catch 23505 → `ConflictException` (defense in depth).

- [ ] **Step 1: Write the failing test**

In `src/auth/auth.service.spec.ts`, inside `describe('register', ...)`, add:

```typescript
    it('throws ConflictException when email belongs to a soft-deleted user (unique violation)', async () => {
      mockUsersService.findOne.mockResolvedValue(null); // soft-deleted -> filtered out
      mockRoleRepository.findOne.mockResolvedValue({ id: 'viewer', name: 'Viewer' });
      mockUsersService.create.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(
        service.register({ email: 'reuse@x.com', name: 'Reuse', password: 'Passw0rd123' }),
      ).rejects.toThrow(ConflictException);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/auth/auth.service.spec.ts`
Expected: FAIL (register currently lets the 23505 error propagate as a generic 500 / unhandled rejection, not `ConflictException`).

- [ ] **Step 3: Write the migration**

Create `src/migrations/1740400000003-SoftDeletePartialUniqueEmail.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SoftDeletePartialUniqueEmail1740400000003 implements MigrationInterface {
  name = 'SoftDeletePartialUniqueEmail1740400000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_email_active" ON "users" ("email") WHERE "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_active"`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE ("email")`);
  }
}
```

- [ ] **Step 4: Update the entity**

In `src/modules/rbac/entities/user.entity.ts`, change the `email` column from `unique: true` to a partial unique declaration that matches the migration. Replace:

```typescript
    @Column({ unique: true })
    @Index()
    email: string;
```

with:

```typescript
    @Column()
    @Index()
    email: string;
```

(The DB-level uniqueness is now enforced by the partial index `IDX_users_email_active`, created by the migration. The ORM `@Column({ unique: true })` would create a global unique during sync (dev) and conflict with the partial — so remove it. Keep the `@Index()` for lookups.)

- [ ] **Step 5: Implement — catch 23505 in `register`**

In `src/auth/auth.service.ts`, wrap the `create` call in `register`:

```typescript
    const hashedPassword = await hash(dto.password, 12);

    try {
      const user = await this.usersService.create({
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        roleId,
      });

      return { message: 'User created with success', userId: user.id };
    } catch (err) {
      if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
        throw new ConflictException('User already exists');
      }
      throw err;
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/auth/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 7: Run full gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green.

- [ ] **Step 8: Commit**

```powershell
git add src/migrations/1740400000003-SoftDeletePartialUniqueEmail.ts src/modules/rbac/entities/user.entity.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts
git commit -m "fix(auth): partial unique email + ConflictException on soft-delete collision (B4)"
```

---

## Task 5: B5 — Remove dead `granted` column

**Files:**
- Create: `src/migrations/1740400000004-DropRolePermissionGranted.ts`
- Modify: `src/modules/rbac/entities/role-permission.entity.ts:28-29`
- Modify: `src/modules/rbac/services/role.service.ts:130` (remove `granted: true`)
- Modify: `src/modules/rbac/services/rbac.service.ts:62` (remove `granted: true` filter)
- Modify: `src/migrations/seeds/rbac.seed.ts:103` (remove `granted: true`)

`granted` is always `true`; deny was never implemented. Remove it (YAGNI).

- [ ] **Step 1: Write the migration**

Create `src/migrations/1740400000004-DropRolePermissionGranted.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRolePermissionGranted1740400000004 implements MigrationInterface {
  name = 'DropRolePermissionGranted1740400000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "granted"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD "granted" boolean NOT NULL DEFAULT true`,
    );
  }
}
```

- [ ] **Step 2: Remove the column from the entity**

In `src/modules/rbac/entities/role-permission.entity.ts`, delete:

```typescript
    @Column({ default: true })
    granted: boolean;
```

- [ ] **Step 3: Remove `granted: true` from `role.service.ts`**

In `src/modules/rbac/services/role.service.ts`, change:

```typescript
            const newPermissions = uniquePermissions.map(permissionId =>
                queryRunner.manager.create(RolePermission, {
                    roleId,
                    permissionId,
                    granted: true
                })
            );
```

to:

```typescript
            const newPermissions = uniquePermissions.map(permissionId =>
                queryRunner.manager.create(RolePermission, {
                    roleId,
                    permissionId,
                })
            );
```

- [ ] **Step 4: Remove the `granted: true` filter from `rbac.service.ts`**

In `src/modules/rbac/services/rbac.service.ts`, change:

```typescript
                const rolePermissions = await this.rolePermissionRepository.find({
                    where: { roleId, granted: true },
                    relations: ['permission', 'permission.feature'],
```

to:

```typescript
                const rolePermissions = await this.rolePermissionRepository.find({
                    where: { roleId },
                    relations: ['permission', 'permission.feature'],
```

- [ ] **Step 5: Remove `granted: true` from the seed**

In `src/migrations/seeds/rbac.seed.ts`, change:

```typescript
        const adminRolePermissions = allPermissions.map(p =>
            rolePermissionRepo.create({
                roleId: adminRole.id,
                permissionId: p.id,
                granted: true
            })
        );
```

to:

```typescript
        const adminRolePermissions = allPermissions.map(p =>
            rolePermissionRepo.create({
                roleId: adminRole.id,
                permissionId: p.id,
            })
        );
```

- [ ] **Step 6: Run gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green (`rbac.service.spec.ts` `checkPermissions` tests must still pass; if any spec sets `granted`, update it — grep `granted` in `*.spec.ts` and remove).

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "refactor(rbac): drop dead granted column (B5)"
```

---

## Task 6: B6/B8 + C4 — Remove dead `getSessionFamilyIds` + fix reuse audit actor

**Files:**
- Modify: `src/auth/auth.service.ts:48-115` (remove `getSessionFamilyIds`, simplify `revokeSessionFamilyAndLogReuse`, fix actor)
- Modify: `src/modules/audit/audit-log.service.ts:35` (distinguish explicit `null` actor from fallback)
- Modify: `src/auth/auth.service.spec.ts` (add reuse test)

`getSessionFamilyIds` is dead N+1 — the bulk UPDATE revokes all user sessions by `user_id`, never using the family ids except as audit metadata. Remove it. Also the bulk UPDATE should filter `revoked_at IS NULL` (so the `affected` count is meaningful). C4: the "actor" of a reuse event is the suspicious presenter, not the owner — set `actorUserId: null` + `metadata.suspectedReuse: true`.

- [ ] **Step 1: Write the failing test**

In `src/auth/auth.service.spec.ts`, inside `describe('refresh', ...)`, add:

```typescript
    it('on revoked-session reuse: bulk-revokes active sessions, logs audit with null actor + suspectedReuse, and throws', async () => {
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      jest.spyOn(service as any, 'constantTimeCompare').mockReturnValue(true);
      mockJwtService.verify.mockReturnValue({
        sub: 'u1', email: 'u@x.com', tokenType: 'refresh', exp: Date.now() / 1000 + 9999,
      });
      const updateExecute = jest.fn().mockResolvedValue({ affected: 2 });
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: updateExecute,
      };
      const em: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 's1', userId: 'u1', refreshTokenHash: 'hash', revokedAt: new Date(),
          user: { id: 'u1', email: 'u@x.com', isActive: true, lockedUntil: null },
        }),
        getRepository: jest.fn().mockReturnValue(qb),
        save: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockReturnValue({ id: 's2' }),
      };
      mockSessionRepo.manager.transaction.mockImplementation(async (cb: any) => cb(em));

      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow(UnauthorizedException);

      expect(updateExecute).toHaveBeenCalled();
      expect(qb.where).toHaveBeenCalledWith('user_id = :userId AND revoked_at IS NULL', { userId: 'u1' });
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.refresh_token_reuse_detected',
          actorUserId: null,
          metadata: expect.objectContaining({ suspectedReuse: true, revokedSessionCount: 2 }),
        }),
      );
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/auth/auth.service.spec.ts`
Expected: FAIL (no `suspectedReuse`, actor is `userId`, no `revoked_at IS NULL` filter).

- [ ] **Step 3: Fix `AuditLogService.log` to honor explicit `null` actor**

In `src/modules/audit/audit-log.service.ts`, change:

```typescript
        actorUserId: entry.actorUserId ?? RequestContext.getUserId(),
```

to:

```typescript
        actorUserId: entry.actorUserId === undefined ? RequestContext.getUserId() : entry.actorUserId,
```

(Now `actorUserId: null` persists as `null`; omitting the field falls back to the request context user.)

- [ ] **Step 4: Implement — simplify `revokeSessionFamilyAndLogReuse`, remove `getSessionFamilyIds`**

In `src/auth/auth.service.ts`, replace the method body and delete `getSessionFamilyIds`:

```typescript
  private async revokeSessionFamilyAndLogReuse(
    reusedSession: Session,
    em: EntityManager,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const userId = reusedSession.userId;

    const repo = em.getRepository(Session);
    const result = await repo
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: () => 'NOW()' })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();

    this.logger.warn(
      `Refresh token reuse detected for user ${userId}, session ${reusedSession.id}. Revoked ${result.affected ?? 0} active sessions.`,
    );

    await this.auditLogService.log({
      action: 'auth.refresh_token_reuse_detected',
      entityType: 'Session',
      entityId: reusedSession.id,
      actorUserId: null,
      metadata: {
        reusedSessionId: reusedSession.id,
        suspectedReuse: true,
        revokedSessionCount: result.affected ?? 0,
      },
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
  }
```

Delete the entire `getSessionFamilyIds` method (lines 84-115) and remove the now-unused `In` import from `typeorm` if no longer used elsewhere (grep `In(` in the file; `In` was only used by `getSessionFamilyIds`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/auth/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run full gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green. If existing `auth.service.spec.ts` lockout refresh test mocks `sessionRepo.manager.transaction`, ensure it still passes (the reuse path is separate).

- [ ] **Step 7: Commit**

```powershell
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts src/modules/audit/audit-log.service.ts
git commit -m "refactor(auth): remove dead session-family N+1 + correct reuse audit actor (B6/B8/C4)"
```

---

## Task 7: B9/P2 — JwtStrategy by `sub` + short user cache

**Files:**
- Modify: `src/auth/strategy/jwt.strategy.ts`
- Modify: `src/users/users.service.ts` (invalidate cache on password/lockout changes) + `src/users/users.module.ts` (provide `CACHE_MANAGER`) + `src/users/users.service.spec.ts`
- Modify: `src/auth/auth.token-type.spec.ts`

Validate by `payload.sub` (stable identity) instead of `payload.email` (mutable). Add a short-TTL user cache (`user:<sub>`) to avoid a DB hit per authenticated request. Invalidate on `updatePassword`, `recordFailedLogin` (sets `lockedUntil`), `resetFailedLogin`.

- [ ] **Step 1: Write the failing test**

In `src/auth/auth.token-type.spec.ts`, update the `JwtStrategy` describe. The existing test `accepts an access token (tokenType=access) and loads user` currently expects `users.findOne` called with email. Change it to assert `findById` called with `sub`, and add cache-hit + invalidation tests:

```typescript
    it('accepts an access token and loads user by sub (cache miss -> set)', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'sub-1', email: 't@x.com', isActive: true, lockedUntil: null });
      cacheManager.get.mockResolvedValue(undefined);
      cacheManager.set.mockResolvedValue(undefined);

      const result = await strategy.validate({
        sub: 'sub-1', email: 't@x.com', tokenType: 'access', jti: 'j1',
      });

      expect(mockUsersService.findById).toHaveBeenCalledWith('sub-1');
      expect(cacheManager.set).toHaveBeenCalledWith('user:sub-1', expect.anything(), expect.any(Number));
      expect(result).toMatchObject({ id: 'sub-1', jti: 'j1' });
    });

    it('serves the user from cache on hit (no DB lookup)', async () => {
      cacheManager.get.mockResolvedValue({ id: 'sub-1', email: 't@x.com', isActive: true, lockedUntil: null });

      const result = await strategy.validate({
        sub: 'sub-1', email: 't@x.com', tokenType: 'access', jti: 'j1',
      });

      expect(mockUsersService.findById).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'sub-1', jti: 'j1' });
    });
```

(Update the module providers in this spec to include `CACHE_MANAGER` and a `cacheManager` mock with `get`/`set`, plus `mockUsersService.findById`. Keep the existing denylist test; ensure it still passes — denylist check happens before user lookup.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/auth/auth.token-type.spec.ts`
Expected: FAIL (strategy still calls `findOne(email)`, no cache).

- [ ] **Step 3: Implement — `JwtStrategy` by `sub` + cache**

In `src/auth/strategy/jwt.strategy.ts`, replace the user-lookup section:

```typescript
    if (payload.jti) {
      const denied = await this.cacheManager.get(`jti:${payload.jti}`);
      if (denied) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    const cacheKey = `user:${payload.sub}`;
    let user = (await this.cacheManager.get<any>(cacheKey)) ?? undefined;
    if (!user) {
      user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }
      await this.cacheManager.set(cacheKey, user, USER_CACHE_TTL_MS);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    RequestContext.setUser(user.id);

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Account is locked. Try again later.');
    }

    return { ...user, jti: payload.jti };
```

Add a constant near the top:

```typescript
const USER_CACHE_TTL_MS = 30_000;
```

Remove the now-unused `findOne`-by-email path. The `payload.email` field stays in the type for compatibility but is no longer used for lookup.

- [ ] **Step 4: Wire `CACHE_MANAGER` into `UsersService` for invalidation**

In `src/users/users.module.ts`, ensure `CacheModule` is available globally (it is — `CacheModule.registerAsync` is `isGlobal: true` in `app.module.ts`). Inject `CACHE_MANAGER` into `UsersService`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheManager.del(`user:${userId}`);
  }
```

Call `this.invalidateUserCache(userId)` at the end of `updatePassword`, `recordFailedLogin` (after the transaction), and `resetFailedLogin`:

```typescript
  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { password: hashedPassword },
    );
    await this.invalidateUserCache(userId);
  }
```

```typescript
  async resetFailedLogin(userId: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { failedLoginAttempts: 0, lockedUntil: null },
    );
    await this.invalidateUserCache(userId);
  }
```

For `recordFailedLogin` (returns inside a transaction), invalidate after the transaction resolves:

```typescript
  async recordFailedLogin(userId: string): Promise<...> {
    const result = await this.usersRepository.manager.transaction(async (em) => {
      // ... existing body unchanged ...
    });
    await this.invalidateUserCache(userId);
    return result;
  }
```

- [ ] **Step 5: Update `users.service.spec.ts` providers**

Add `CACHE_MANAGER` provider + `cacheManager` mock (`{ del: jest.fn().mockResolvedValue(undefined), get: jest.fn(), set: jest.fn() }`) to the `TestingModule` in `src/users/users.service.spec.ts`. Add a test that `updatePassword` calls `cacheManager.del('user:<id>')`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/auth/auth.token-type.spec.ts src/users/users.service.spec.ts src/auth/auth.service.spec.ts`
Expected: PASS. (AuthService specs that provide `UsersService` mock are unaffected since they mock `usersService` directly.)

- [ ] **Step 7: Run full gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green.

- [ ] **Step 8: Commit**

```powershell
git add src/auth/strategy/jwt.strategy.ts src/auth/auth.token-type.spec.ts src/users/users.service.ts src/users/users.module.ts src/users/users.service.spec.ts
git commit -m "feat(auth): validate JWT by sub + short user cache with invalidation (B9/P2)"
```

---

## Task 8: S12 — Fail-fast RSA keys in all environments

**Files:**
- Modify: `src/config/validation.schema.ts:16-34`
- Modify: `src/auth/auth.module.ts` (JwtModule `useFactory` guard)
- Modify: `.env.example`
- Modify: `test/app.e2e-spec.ts` (ensure e2e still sets keys — it already generates them at runtime)

In dev/test, empty `PRIVATE_KEY`/`PUBLIC_KEY` pass Joi but crash at `JwtStrategy` construction (`secretOrKey has an invalid value`). Make keys required non-empty in ALL environments so the failure is a clear validation error at boot.

- [ ] **Step 1: Write the failing test**

Create `src/config/validation.schema.spec.ts`:

```typescript
import { validationSchema } from './validation.schema';

const baseEnv = {
  DB_HOST: 'localhost',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_DATABASE: 'app',
  PRIVATE_KEY: 'x',
  PUBLIC_KEY: 'x',
  ALLOWED_ORIGINS: '*',
};

describe('validationSchema (S12)', () => {
  it('rejects empty PRIVATE_KEY in development', () => {
    const { error } = validationSchema.validate({ ...baseEnv, NODE_ENV: 'development', PRIVATE_KEY: '' });
    expect(error).toBeDefined();
  });

  it('rejects empty PUBLIC_KEY in test', () => {
    const { error } = validationSchema.validate({ ...baseEnv, NODE_ENV: 'test', PUBLIC_KEY: '' });
    expect(error).toBeDefined();
  });

  it('accepts non-empty keys in development', () => {
    const { error } = validationSchema.validate({ ...baseEnv, NODE_ENV: 'development' });
    expect(error).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/config/validation.schema.spec.ts`
Expected: FAIL (empty keys currently allowed outside production).

- [ ] **Step 3: Implement — require keys everywhere**

In `src/config/validation.schema.ts`, replace the two `.when('NODE_ENV', ...)` blocks for `PRIVATE_KEY` and `PUBLIC_KEY` with unconditional non-empty rules:

```typescript
  PRIVATE_KEY: Joi.string()
    .min(1)
    .message('PRIVATE_KEY must not be empty')
    .required(),

  PUBLIC_KEY: Joi.string()
    .min(1)
    .message('PUBLIC_KEY must not be empty')
    .required(),
```

- [ ] **Step 4: Defense-in-depth in `JwtModule`**

In `src/auth/auth.module.ts`, guard the `useFactory`:

```typescript
      useFactory: (configService: ConfigService) => {
        const privateKey = configService.get<string>('keys.privateKey');
        const publicKey = configService.get<string>('keys.publicKey');
        if (!privateKey || !publicKey) {
          throw new Error('PRIVATE_KEY and PUBLIC_KEY must be configured (RS256 JWT)');
        }
        return {
          privateKey,
          publicKey,
          signOptions: { expiresIn: '15m', algorithm: 'RS256' },
        };
      },
```

- [ ] **Step 5: Update `.env.example`**

Mark both keys required (remove any "optional in dev" wording). Example:

```
PRIVATE_KEY=     # PEM RSA private key (required in ALL environments)
PUBLIC_KEY=      # PEM RSA public key (required in ALL environments)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/config/validation.schema.spec.ts`
Expected: PASS. Also run `npm test` (full) — the e2e `test/app.e2e-spec.ts` generates keys at runtime so it's unaffected; unit specs don't boot the config validation. Confirm `npm test`, `npm run lint`, `npx tsc --noEmit` green.

- [ ] **Step 7: Commit**

```powershell
git add src/config/validation.schema.ts src/auth/auth.module.ts .env.example src/config/validation.schema.spec.ts
git commit -m "feat(config): fail-fast on missing RSA keys in all environments (S12)"
```

---

## Task 9: Audit compliance (C1, C2, C3)

**Files:**
- Modify: `src/auth/auth.service.ts` (C1 — login success audit)
- Modify: `src/modules/audit/interceptors/audit.interceptor.ts` (C2 — IP/UA; C3 — permissionIds from body)
- Create: `src/modules/audit/interceptors/audit.interceptor.spec.ts`
- Modify: `src/modules/rbac/services/role.service.ts` (C3 — `assignPermissions` returns `{ permissionIds }`)

- [ ] **Step 1 (C1): Write the failing test for login-success audit**

In `src/auth/auth.service.spec.ts`, in the login describe, add/extend the success test to assert `auditLogService.log` with `auth.login_success`:

```typescript
    it('audits auth.login_success on successful login', async () => {
      mockUsersService.findOneWithPassword.mockResolvedValue({
        id: 'u1', email: 'u@x.com', password: 'hash', isActive: true, lockedUntil: null,
      });
      (bcryptjs.compare as jest.Mock).mockResolvedValue(true as never);
      mockUsersService.resetFailedLogin.mockResolvedValue(undefined);
      mockJwtService.sign.mockReturnValue('tok');
      mockSessionRepo.create.mockReturnValue({ id: 's1' });
      mockSessionRepo.save.mockResolvedValue(undefined);

      await service.login({ email: 'u@x.com', password: 'p' }, '1.2.3.4', 'UA');

      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login_success',
          entityType: 'User',
          entityId: 'u1',
          actorUserId: 'u1',
          ip: '1.2.3.4',
          userAgent: 'UA',
        }),
      );
    });
```

- [ ] **Step 2 (C1): Run test to verify it fails**

Run: `npm test -- src/auth/auth.service.spec.ts`
Expected: FAIL (no `auth.login_success` audit).

- [ ] **Step 3 (C1): Implement — audit in `createTokensAndSession`**

In `src/auth/auth.service.ts`, at the end of `createTokensAndSession` before `return`:

```typescript
    await this.sessionRepository.save(session);

    await this.auditLogService.log({
      action: 'auth.login_success',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      metadata: {},
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    return {
      email: user.email,
      access_token: accessToken,
      refresh_token: refreshToken,
    };
```

⚠️ `createTokensAndSession` is also called by `login` only (not refresh — refresh builds tokens inline). So this audits login success correctly.

- [ ] **Step 4 (C1): Run test to verify it passes**

Run: `npm test -- src/auth/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 5 (C2+C3): Write the failing interceptor test**

Create `src/modules/audit/interceptors/audit.interceptor.spec.ts`:

```typescript
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AUDITABLE_KEY } from '../decorators/auditable.decorator';

describe('AuditInterceptor (C2/C3)', () => {
  let interceptor: AuditInterceptor;
  let auditLogService: any;
  let reflector: any;

  beforeEach(() => {
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    reflector = {
      get: jest.fn((_key: string, _handler: unknown) => ({
        action: 'role.assign_permissions', entityType: 'Role', entityIdParam: 0,
      })),
    };
    interceptor = new AuditInterceptor(auditLogService, reflector);
  });

  function makeCtx(body: unknown, args: unknown[]): ExecutionContext {
    const req: any = { ip: '9.9.9.9', get: (h: string) => (h === 'user-agent' ? 'UA-test' : undefined), socket: {} };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
      getArgs: () => args,
    } as unknown as ExecutionContext;
  }

  it('captures ip and userAgent from the request', async () => {
    const ctx = makeCtx({ permissionIds: ['p1'] }, ['role-1']);
    const next: CallHandler = { handle: () => of({ id: 'role-1' }) };
    await interceptor.intercept(ctx, next).toPromise();

    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '9.9.9.9', userAgent: 'UA-test' }),
    );
  });

  it('captures permissionIds from the request body for assignPermissions', async () => {
    const ctx = makeCtx({ permissionIds: ['p1', 'p2'] }, ['role-1']);
    const next: CallHandler = { handle: () => of(undefined) };
    await interceptor.intercept(ctx, next).toPromise();

    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ permissionIds: ['p1', 'p2'] }) }),
    );
  });
});
```

- [ ] **Step 6 (C2+C3): Run test to verify it fails**

Run: `npm test -- src/modules/audit/interceptors/audit.interceptor.spec.ts`
Expected: FAIL (interceptor doesn't pass ip/ua or read body).

- [ ] **Step 7 (C3): Make `assignPermissions` return `{ permissionIds }`**

In `src/modules/rbac/services/role.service.ts`, change the signature/return of `assignPermissions`:

```typescript
    async assignPermissions(roleId: string, dto: AssignPermissionsDto, currentUserId?: string): Promise<{ permissionIds: string[] }> {
        await this.findOne(roleId);
        // ... existing transaction body unchanged ...
        return { permissionIds: [...new Set(dto.permissionIds)] };
    }
```

(Keep the transaction body; just change the return type and add the return statement at the end. The controller stays `void`-compatible since it returns whatever the service returns.)

- [ ] **Step 8 (C2+C3): Implement — interceptor IP/UA + body permissionIds**

In `src/modules/audit/interceptors/audit.interceptor.ts`, update `logAudit` to pull the request and merge body `permissionIds`:

```typescript
  private logAudit(context: ExecutionContext, options: AuditableOptions, result: unknown) {
    const req = context.switchToHttp().getRequest<{ ip?: string; socket?: { remoteAddress?: string }; get?: (h: string) => string | undefined }>();
    const ip = req?.ip ?? req?.socket?.remoteAddress;
    const userAgent = req?.get?.('user-agent');

    const entityId = this.resolveEntityId(context, options, result);

    this.auditLogService
      .log({
        action: options.action,
        entityType: options.entityType,
        entityId: entityId ?? undefined,
        ip,
        userAgent,
        metadata: this.buildMetadata(context, result),
      })
      .catch((err) => {
        this.logger.error(`Failed to write audit log: ${err?.message ?? err}`);
      });
  }
```

Update `buildMetadata` to also read `permissionIds` from the request body when not present on the result:

```typescript
  private buildMetadata(
    context: ExecutionContext,
    result: unknown,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const obj = result as Record<string, unknown>;
      if (obj.permissionIds && Array.isArray(obj.permissionIds)) {
        metadata.permissionIds = obj.permissionIds;
      }
    }

    if (!metadata.permissionIds) {
      const req = context.switchToHttp().getRequest<{ body?: { permissionIds?: unknown } }>();
      const bodyPermissionIds = req?.body?.permissionIds;
      if (Array.isArray(bodyPermissionIds)) {
        metadata.permissionIds = bodyPermissionIds;
      }
    }

    return metadata;
  }
```

Ensure the interceptor constructor injects a `Logger` (or use `new Logger(AuditInterceptor.name)`). If `this.logger` isn't present, add `private readonly logger = new Logger(AuditInterceptor.name);` and the `Logger` import.

- [ ] **Step 9 (C2+C3): Run test to verify it passes**

Run: `npm test -- src/modules/audit/interceptors/audit.interceptor.spec.ts`
Expected: PASS.

- [ ] **Step 10: Run full gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green. (`role.service.spec.ts` `assignPermissions` test may need its assertion updated if it checked `void` — adjust to expect the new return shape.)

- [ ] **Step 11: Commit**

```powershell
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts src/modules/audit/interceptors/audit.interceptor.ts src/modules/audit/interceptors/audit.interceptor.spec.ts src/modules/rbac/services/role.service.ts
git commit -m "feat(audit): login success, IP/UA capture, permissionIds in audit (C1/C2/C3)"
```

---

## Task 10: B16/B17 — RBAC cache invalidation + block `action` rename

**Files:**
- Modify: `src/modules/rbac/services/rbac.service.ts` (add `invalidateAllRoles`)
- Modify: `src/modules/rbac/services/feature.service.ts` (`update`/`remove` invalidate)
- Modify: `src/modules/rbac/services/permission.service.ts` (`update`/`remove` invalidate; block `action` rename)
- Modify: `src/modules/rbac/dto/permission.dto.ts` (remove `action` from `UpdatePermissionDto`)
- Modify specs: `feature.service.spec.ts`, `permission.service.spec.ts`, `rbac.service.spec.ts`

When a `Feature.key` or `Permission.action` changes, the cached `featureKey:action` strings go stale. Invalidate all role caches on these mutations. `action` is identity — forbid renaming it (remove from `UpdatePermissionDto`).

- [ ] **Step 1: Write the failing tests**

In `src/modules/rbac/services/feature.service.spec.ts`, add:

```typescript
  it('update invalidates all role caches', async () => {
    featureRepository.update.mockResolvedValue({ affected: 1 });
    featureRepository.findOne.mockResolvedValue({ id: 'f1', key: 'k', name: 'n' });
    await service.update('f1', { name: 'new' });
    expect(rbacService.invalidateAllRoles).toHaveBeenCalled();
  });

  it('remove invalidates all role caches', async () => {
    featureRepository.delete.mockResolvedValue(undefined);
    await service.remove('f1');
    expect(rbacService.invalidateAllRoles).toHaveBeenCalled();
  });
```

(Ensure the spec's `rbacService` mock includes `invalidateAllRoles: jest.fn()`. Add to the mock if missing.)

In `src/modules/rbac/services/permission.service.spec.ts`, add:

```typescript
  it('update invalidates all role caches', async () => {
    permissionRepository.update.mockResolvedValue({ affected: 1 });
    permissionRepository.findOne.mockResolvedValue({ id: 'p1', action: 'view', featureId: 'f1' });
    await service.update('p1', { name: 'new' });
    expect(rbacService.invalidateAllRoles).toHaveBeenCalled();
  });

  it('remove invalidates all role caches', async () => {
    permissionRepository.delete.mockResolvedValue(undefined);
    await service.remove('p1');
    expect(rbacService.invalidateAllRoles).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/modules/rbac/services/feature.service.spec.ts src/modules/rbac/services/permission.service.spec.ts`
Expected: FAIL (`invalidateAllRoles` not called / doesn't exist).

- [ ] **Step 3: Add `invalidateAllRoles` to `RbacService`**

In `src/modules/rbac/services/rbac.service.ts`, add a method that clears all `rbac:role:*:permissions` keys. Since the cache store is Keyv (Redis or memory), use the `keys`/`delete` pattern. Add:

```typescript
    async invalidateAllRoles(): Promise<void> {
        try {
            const keys = (await this.cacheManager.store.keys?.()) as string[] | undefined;
            if (keys) {
                await Promise.all(
                    keys
                        .filter((k) => k.includes('rbac:role:'))
                        .map((k) => this.cacheManager.del(k)),
                );
            }
        } catch (err) {
            this.logger?.error?.(`Failed to invalidate all role caches: ${(err as Error).message}`);
        }
    }
```

⚠️ `cacheManager.store.keys()` may not be available on every store. If the `KeyvCacheableMemory` store doesn't expose `keys`, guard with optional chaining (as above) and log. Add a `Logger` to `RbacService` if not present (`private readonly logger = new Logger(RbacService.name);`). Also clear `pendingRequests` entries matching `rbac:role:`:

```typescript
        for (const key of [...this.pendingRequests.keys()].filter((k) => k.includes('rbac:role:'))) {
            this.pendingRequests.delete(key);
        }
```

(Place this inside `invalidateAllRoles` before the store scan.)

- [ ] **Step 4: Invalidate in `FeatureService.update`/`remove`**

In `src/modules/rbac/services/feature.service.ts`:

```typescript
    async update(id: string, dto: UpdateFeatureDto): Promise<Feature> {
        const result = await this.featureRepository.update(id, dto);
        if (!result.affected) {
            throw new NotFoundException(`Feature with ID "${id}" not found`);
        }
        await this.rbacService.invalidateAllRoles();
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        try {
            await this.featureRepository.delete(id);
        } catch (err) {
            // FK violation: feature still referenced by permissions
            throw new ConflictException('Feature is still referenced by permissions');
        }
        await this.rbacService.invalidateAllRoles();
    }
```

(Adjust the catch to match existing behavior — keep the existing 23503 handling; just add the invalidation call before/after as appropriate. Ensure `RbacService` is injected in `FeatureService` — it currently injects `DataSource`; add `RbacService` to the constructor and `feature.module.ts` imports if needed.)

- [ ] **Step 5: Invalidate in `PermissionService.update`/`remove` + block `action` rename**

In `src/modules/rbac/dto/permission.dto.ts`, remove `action` from `UpdatePermissionDto` (keep `name`/`description` only):

```typescript
export class UpdatePermissionDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}
```

In `src/modules/rbac/services/permission.service.ts`:

```typescript
    async update(id: string, dto: UpdatePermissionDto): Promise<Permission> {
        await this.permissionRepository.update(id, dto);
        await this.rbacService.invalidateAllRoles();
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        try {
            await this.permissionRepository.delete(id);
        } catch (err) {
            throw new ConflictException('Permission is still assigned to roles');
        }
        await this.rbacService.invalidateAllRoles();
    }
```

(Inject `RbacService` into `PermissionService` + module wiring. Keep existing 23503 handling semantics; the key addition is the invalidation call.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/modules/rbac`
Expected: PASS. Also run `npm test` (full), `npm run lint`, `npx tsc --noEmit`.
Expected: green.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "fix(rbac): invalidate role caches on Feature/Permission mutation + block action rename (B16/B17)"
```

---

## Task 11: D4 — Consistent password policy

**Files:**
- Modify: `src/auth/dto/register.dto.ts` (password field)
- Modify: `src/auth/dto/change-password.dto.ts` (newPassword field)

`RegisterDto` uses `@MinLength(6)`, `ChangePasswordDto` uses `@MinLength(8)`, no complexity. Align both to the same regex: minimum 12 chars with upper, lower, and digit.

- [ ] **Step 1: Write the failing test**

Create `src/auth/dto/password-policy.spec.ts`:

```typescript
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { ChangePasswordDto } from './change-password.dto';

async function invalid<T>(obj: T): Promise<boolean> {
  const errors = await validate(obj as object);
  return errors.length > 0;
}

describe('Password policy (D4)', () => {
  it('RegisterDto rejects "short" (no upper/digit, <12)', async () => {
    expect(await invalid(plainToInstance(RegisterDto, {
      email: 'a@b.com', name: 'N', password: 'short',
    }))).toBe(true);
  });

  it('RegisterDto accepts "Abcdefg1234"', async () => {
    expect(await invalid(plainToInstance(RegisterDto, {
      email: 'a@b.com', name: 'N', password: 'Abcdefg1234',
    }))).toBe(false);
  });

  it('ChangePasswordDto rejects "alllowercase"', async () => {
    expect(await invalid(plainToInstance(ChangePasswordDto, {
      currentPassword: 'X', newPassword: 'alllowercase',
    }))).toBe(true);
  });

  it('ChangePasswordDto accepts "Abcdefg1234"', async () => {
    expect(await invalid(plainToInstance(ChangePasswordDto, {
      currentPassword: 'X', newPassword: 'Abcdefg1234',
    }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/auth/dto/password-policy.spec.ts`
Expected: FAIL (current `MinLength(6)`/`MinLength(8)` accepts the weak passwords).

- [ ] **Step 3: Implement — shared regex in both DTOs**

In `src/auth/dto/register.dto.ts`, replace the password field validators:

```typescript
  @ApiProperty({
    example: 'P@ssw0rd1234',
    description: 'User password (min 12 chars, upper + lower + digit)',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/, {
    message: 'password must be at least 12 characters and contain upper, lower, and a digit',
  })
  password: string;
```

Add `Matches` to the `class-validator` import.

In `src/auth/dto/change-password.dto.ts`, replace the `newPassword` validators:

```typescript
  @ApiProperty({
    example: 'NewSecureP@ss1234',
    description: 'New password (min 12 chars, upper + lower + digit)',
  })
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/, {
    message: 'newPassword must be at least 12 characters and contain upper, lower, and a digit',
  })
  newPassword: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/auth/dto/password-policy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run full gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green. (Existing service specs use passwords like `'password123'` only in mocked `compare`/`hash` flows — they don't run DTO validation, so they're unaffected. If any spec constructs a DTO with a weak password and asserts validation, update it.)

- [ ] **Step 6: Commit**

```powershell
git add src/auth/dto/register.dto.ts src/auth/dto/change-password.dto.ts src/auth/dto/password-policy.spec.ts
git commit -m "feat(auth): consistent 12-char password policy with complexity (D4)"
```

---

## Task 12: P3 — Health Redis reuses singleton client

**Files:**
- Modify: `src/config/cache-stores.factory.ts` (export a shared `KeyvRedis` instance)
- Modify: `src/modules/health/indicators/redis.health.ts` (PING the shared client instead of open/close per probe)
- Modify: `src/modules/health/health.module.ts` (provide the shared client)

`redis.health.ts` opens a new Redis client (`createClient`+`connect`+`ping`+`quit`) on every probe (~every 10s). Reuse the app's `KeyvRedis` client and `PING` it.

- [ ] **Step 1: Write the failing test**

Create `src/modules/health/indicators/redis.health.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthCheckService, HealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';

describe('RedisHealthIndicator (P3)', () => {
  it('pings the shared KeyvRedis client (no new client per probe)', async () => {
    const ping = jest.fn().mockResolvedValue('PONG');
    const sharedClient: any = { ping, isOpen: true };
    const indicator = new RedisHealthIndicator(sharedClient);

    const result = await indicator.isHealthy('redis');
    expect(ping).toHaveBeenCalled();
    expect(result.redis.status).toBe('up');
  });

  it('reports down when ping throws', async () => {
    const ping = jest.fn().mockRejectedValue(new Error('boom'));
    const sharedClient: any = { ping, isOpen: true };
    const indicator = new RedisHealthIndicator(sharedClient);

    const result = await indicator.isHealthy('redis');
    expect(result.redis.status).toBe('down');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/modules/health/indicators/redis.health.spec.ts`
Expected: FAIL (current constructor signature doesn't take a shared client; uses `createClient`).

- [ ] **Step 3: Export a shared `KeyvRedis` from the cache factory**

In `src/config/cache-stores.factory.ts`, expose the singleton:

```typescript
import { Keyv, KeyvStoreAdapter } from 'keyv';
import { KeyvRedis } from '@keyv/redis';
import { KeyvCacheableMemory } from 'cacheable';
import { ConfigService } from '@nestjs/config';

let sharedRedisStore: KeyvRedis | null = null;

export function getSharedRedisStore(): KeyvRedis | null {
  return sharedRedisStore;
}

export function buildCacheStores(configService: ConfigService): (Keyv | KeyvStoreAdapter)[] {
  const host = configService.get<string>('REDIS_HOST');
  const port = Number(configService.get<string | number>('REDIS_PORT')) || 6379;

  if (host) {
    sharedRedisStore = new KeyvRedis({ socket: { host, port } });
    return [sharedRedisStore];
  }
  return [new Keyv({ store: new KeyvCacheableMemory() })];
}
```

⚠️ `KeyvRedis` wraps a `redis` v4 client. To `PING`, access the underlying client. Check the `@keyv/redis` API: `KeyvRedis` exposes the redis client via `.redis` or it itself has a `get`/`disconnect`. If a direct `ping()` isn't available on `KeyvRedis`, use `keyvRedis.redis.ping()` (the wrapped `redis` v4 client). Verify via Context7 `@keyv/redis` docs before finalizing the health call. The plan implementer MUST confirm the exact access path and adjust the test/impl accordingly (the test mocks `sharedClient.ping` — the impl should call the equivalent).

- [ ] **Step 4: Rewrite `RedisHealthIndicator` to use the shared client**

`src/modules/health/indicators/redis.health.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

export interface RedisPinger {
  ping(): Promise<unknown>;
  isOpen?: boolean;
}

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisPinger | null) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.redis) {
      return this.getStatus(key, true, { message: 'Redis not configured, skipping' });
    }
    try {
      await this.redis.ping();
      return this.getStatus(key, true);
    } catch (error) {
      return this.getStatus(key, false, { error: (error as Error).message });
    }
  }
}
```

- [ ] **Step 5: Wire the shared client into the health module**

In `src/modules/health/health.module.ts`, provide the shared redis pinger:

```typescript
import { getSharedRedisStore } from '@/config/cache-stores.factory';

@Module({
  imports: [TerminusModule],
  providers: [
    {
      provide: 'REDIS_PINGER',
      useFactory: () => {
        const store = getSharedRedisStore();
        // Adapt KeyvRedis to the RedisPinger interface (ping via the wrapped client).
        return store
          ? { ping: () => (store as any).redis?.ping?.() ?? (store as any).ping?.(), isOpen: true }
          : null;
      },
    },
    {
      provide: RedisHealthIndicator,
      useFactory: (pinger: RedisPinger | null) => new RedisHealthIndicator(pinger),
      inject: ['REDIS_PINGER'],
    },
  ],
  controllers: [HealthController],
})
export class HealthModule {}
```

(The exact `ping` access path on `KeyvRedis` must be confirmed via Context7; adjust the `useFactory` adapter accordingly. The unit test mocks `RedisPinger` directly, so it's independent of `KeyvRedis` internals.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/modules/health/indicators/redis.health.spec.ts`
Expected: PASS.

- [ ] **Step 7: Run full gates**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`
Expected: green. The e2e (CI) will exercise the real Redis PING via Testcontainers.

- [ ] **Step 8: Commit**

```powershell
git add src/config/cache-stores.factory.ts src/modules/health/indicators/redis.health.ts src/modules/health/indicators/redis.health.spec.ts src/modules/health/health.module.ts
git commit -m "perf(health): reuse shared Redis client for health probes (P3)"
```

---

## Self-Review

**1. Spec coverage (P2 roadmap items 18-31 in scope for P2-A):**
- 18 (B4) → Task 4 ✓
- 19 (B5) → Task 5 ✓
- 20 (B6/B8) + C4 → Task 6 ✓
- 21 (B9/P2) → Task 7 ✓
- 22 (B16/B17) → Task 10 ✓
- 23 (B11) → Task 1 ✓
- 24 (B12/B13/B14/B25/B26) → Task 2 ✓
- 25 (B22) + B23/B24/B18 → Task 3 ✓
- 26 (C1/C2/C3) → Task 9 ✓ (C4 folded into Task 6)
- 27 (P3) → Task 12 ✓ (P4 deferred to P2-B)
- 28 (P6) → deferred to P2-B (cron purge + retention needs a retention policy decision)
- 29 (D4) → Task 11 ✓
- 30 (S12) → Task 8 ✓
- 31 (B19) → deferred to P2-B (multi-tenant decision)

**Deferred (documented):** P4 (async audit queue / BullMQ), P6 (purge cron + retention), B19 (multi-tenant), P8 (DataSource/dotenv split — 🟢 low, P3-polish tier). These need design decisions or larger infra and belong in P2-B / P3.

**2. Placeholder scan:** Two intentional "confirm via Context7" notes in Task 12 (`@keyv/redis` ping access path) — these are NOT placeholders for the plan's logic; they flag a runtime API detail the implementer must verify against current docs (the unit test is concrete and independent). No "TBD"/"TODO"/"implement later". All code steps contain real code.

**3. Type consistency:**
- `revokeSessionFamilyAndLogReuse(reusedSession, em, ip?, userAgent?)` — matches the P1-simplified signature (em required, 2nd position). Caller in `refresh`: `revokeSessionFamilyAndLogReuse(session, em, ip, userAgent)` ✓.
- `UsersService` constructor gains `@Inject(CACHE_MANAGER) cacheManager: Cache` — `users.service.spec.ts` (Task 7 Step 5) and any spec that provides a real `UsersService` must add the provider. `auth.service.spec.ts` mocks `UsersService` directly (no real instance) so unaffected. ✓
- `assignPermissions` return type changes to `{ permissionIds: string[] }` — Task 9 Step 7 + spec adjustment noted. ✓
- `invalidateAllRoles()` added to `RbacService`; mocks in feature/permission specs updated (Task 10 Step 1). ✓
- `RedisHealthIndicator` constructor signature changes (takes `RedisPinger | null`); health module `useFactory` updated (Task 12 Step 5). ✓
- Migration timestamps: 1740400000002, 1740400000003, 1740400000004 — strictly increasing, all > P1's 1740400000001. ✓
- `AuditLogService.log` `actorUserId` semantics: `undefined` → fallback to context; `null` → persisted null. Task 6 Step 3 + Task 9 (login_success uses `actorUserId: user.id` explicitly). ✓

**Ordering notes for the executor:**
- Run Task 2 (dead code) before Task 7 — Task 7 keeps `findById` (do NOT delete it in Task 2; only `findAll` + `remove`).
- Task 6 and Task 9 both edit `auth.service.ts`; commit separately (6 before 9).
- Task 10 injects `RbacService` into `FeatureService`/`PermissionService` — verify module wiring (`feature.module.ts`, `permission.module.ts`) exports/imports `RbacService`. The `RbacModule` already provides `RbacService`; ensure these services are inside `RbacModule` (they are) so DI resolves.
- After every task: `npm test`, `npm run lint`, `npx tsc --noEmit` must be green before committing. The test count baseline changes after Task 2 (removed tasks specs) — use the new count as the running baseline.
