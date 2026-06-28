# P1 High-Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 12 P1 "Altas" items from `docs/ANALISE_PROFUNDA.md` §8: lockout-on-refresh (S4), DB SSL with CA (S5), `@nestjs/throttler` with strict login throttle by IP+email (S6/D2), password projection hygiene (S7), logout + jti denylist (S9/F2), global default-deny guard + `@Public()` (S10/F5), atomic refresh rotation (S11), TypeORM query-cache cleanup (B2), role assignment on register (B3), async bcrypt + cost 12 (P1-bcrypt), CI pipeline (I3), and ESLint flat-config migration (I4).

**Architecture:**
- **S4** — mirror `login`'s `lockedUntil` check inside `refresh`, after `session.user` is loaded.
- **S7** — split `UsersService.findOne` into a password-including variant (`findOneWithPassword`) for `login`/`changePassword`, and keep `findOne` (no password) for `JwtStrategy`/`register` existence check. Mark `password` column `select: false` so default queries exclude it.
- **S9/F2** — add a `jti` (UUID) claim to access & refresh tokens; persist `jti` on `Session` (migration); `JwtStrategy` rejects tokens whose `jti` is in a Redis-backed denylist; `POST /auth/logout` and `POST /auth/logout-all` revoke sessions + denylist the access `jti`.
- **S10/F5** — add `@Public()` decorator + make `JwtAuthGuard` honor it; register `JwtAuthGuard` as `APP_GUARD` (default-deny); mark public routes (`/`, `/auth/login`, `/auth/refresh`, `/health/*`).
- **S11** — wrap `refresh`'s read-check-revoke-create in `manager.transaction` with a `pessimistic_write` lock on the session row.
- **S6/D2** — replace `express-rate-limit` with `@nestjs/throttler` v6 (`ThrottlerModule.forRoot` + `APP_GUARD` `ThrottlerGuard`); a named `login` throttler with a `generateKey` combining IP + email.
- **B2** — remove the orphaned TypeORM `cache:` options from the 3 RBAC queries (RBAC already uses Nest `CACHE_MANAGER`/Redis; no `cache` provider is configured on the DataSource).
- **B3** — resolve a default role by name (`Viewer`) in `register` and pass `roleId` to `usersService.create`.
- **S5** — extend DB SSL to `{ ca: DB_SSL_CA, rejectUnauthorized: true }` in prod; add `DB_SSL_CA` to config + Joi schema + `.env.example`.
- **P1-bcrypt** — migrate `login` (`compareSync`→`compare`) and `register` (`hashSync`→`hash`, cost 10→12) to async; update the 5 bcrypt spies across 2 specs.
- **I4** — migrate `.eslintrc.js` → `eslint.config.mjs` (flat) using `typescript-eslint` + `@eslint/js` + `eslint-config-prettier`; drop `eslint-plugin-prettier`/legacy parser deps; restore a working `npm run lint`.
- **I3** — add `.github/workflows/ci.yml` (install, lint, tsc, unit test, e2e with Testcontainers postgres:16 + redis:7, npm audit) + `test:e2e` script + `@testcontainers/postgresql`/`@testcontainers/redis` devDeps.

**Tech Stack:** NestJS 11, `@nestjs/throttler` ^6, `@nestjs/jwt` 11, TypeORM 0.3 (transactions, `pessimistic_write`, query cache), `cache-manager`/Keyv (denylist), `bcryptjs` ^3 (async), Jest 30/ts-jest 29, ESLint 10 (flat config) + `typescript-eslint`, GitHub Actions + Testcontainers.

**Scope note:** This plan covers ONLY the P1 items. P2/P3 items remain separate plans. Do not expand scope.

**TDD discipline (strict):** Every behavior task writes a failing test first, runs it red, implements the minimum to pass, runs it green, then commits. Infra tasks (I4, I3, S5, B2) use a command-level verification gate (`npm run lint`, `docker`/`tsc`, build) instead of a unit test, noted explicitly in the task.

**Baseline:**
- Branch from the P0 base (either `main` after merging `p0-critical-fixes`, or directly from `p0-critical-fixes`). The P0 `/simplify` pass is committed (or commit it first: `git add -A && git commit -m "chore: simplify p0 (drop lambda, dead params, non-JSDoc comments)"`).
- Confirm green baseline: `npm test` (13 suites/62 tests) and `npx tsc --noEmit` clean.
- Create branch: `git checkout -b p1-high-priority`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `eslint.config.mjs` | Create | Flat ESLint config (I4). |
| `.eslintrc.js` | Delete | Replaced by flat config (I4). |
| `package.json` | Modify | Add/adjust deps + scripts (I3, I4, S6, S9). |
| `src/auth/auth.service.ts` | Modify | bcrypt async (P1); `ensureNotLocked` in `refresh` (S4); `jti` claim + `logout`/`logoutAll` (S9); atomic `refresh` (S11); default role in `register` (B3). |
| `src/auth/auth.service.spec.ts` | Modify | Update bcrypt spies to async (P1); `refresh` lockout test (S4); `register` role test (B3); `logout` tests (S9). |
| `src/auth/auth.token-type.spec.ts` | Modify | Update `compareSync` spy → `compare` (P1). |
| `src/auth/auth.controller.ts` | Modify | `@Public()` on login/refresh (S10); `logout`/`logout-all` endpoints (S9); `@Throttle` on login (S6). |
| `src/auth/auth.controller.spec.ts` | Modify | `logout`/`logout-all` route tests (S9). |
| `src/auth/dto/register.dto.ts` | Modify | Optional `roleId` (B3). |
| `src/auth/strategy/jwt.strategy.ts` | Modify | `findOne` (no password) (S7); `jti` denylist check (S9). |
| `src/auth/strategy/jwt-auth.guard.ts` | Modify | Honor `@Public()` (S10). |
| `src/auth/strategy/jwt-auth.guard.spec.ts` | Create | Tests for `@Public()` bypass (S10). |
| `src/auth/throttlers/login-throttle.util.ts` | Create | Pure `buildLoginThrottleKey(ip, email)` helper (S6). |
| `src/auth/throttlers/login-throttle.util.spec.ts` | Create | Tests for the helper (S6). |
| `src/common/decorators/public.decorator.ts` | Create | `@Public()` + `IS_PUBLIC_KEY` (S10). |
| `src/users/users.service.ts` | Modify | `findOne` (no password) + `findOneWithPassword` (S7). |
| `src/users/users.service.spec.ts` | Modify | Update `findOne` expectation + `findOneWithPassword` test (S7). |
| `src/modules/rbac/entities/user.entity.ts` | Modify | `password` column `select: false` (S7). |
| `src/modules/rbac/entities/session.entity.ts` | Modify | Add `jti` column (S9). |
| `src/migrations/<ts>-AddSessionJti.ts` | Create | Migration adding `sessions.jti` (S9). |
| `src/modules/rbac/services/permission.service.ts` | Modify | Remove `cache:` (B2). |
| `src/modules/rbac/services/feature.service.ts` | Modify | Remove `cache:` (B2). |
| `src/modules/rbac/services/role.service.ts` | Modify | Remove `cache:` (B2). |
| `src/config/database.ts` | Modify | SSL `ca` + `rejectUnauthorized: true` (S5). |
| `src/config/validation.schema.ts` | Modify | `DB_SSL_CA` rule (S5). |
| `.env.example` | Modify | Document `DB_SSL_CA`, `REDIS_*`, `RBAC_CACHE_TTL` (S5). |
| `src/app.module.ts` | Modify | `ThrottlerModule` + `APP_GUARD` `ThrottlerGuard` + `APP_GUARD` `JwtAuthGuard` (S6, S10). |
| `src/main.ts` | Modify | Remove `express-rate-limit` (S6). |
| `test/app.e2e-spec.ts` | Modify | Testcontainers bootstrap + auth e2e (I3). |
| `test/jest-e2e.json` | Modify | Keep/adjust (I3). |
| `.github/workflows/ci.yml` | Create | CI pipeline (I3). |

---

## Task 1: I4 — Migrate ESLint to flat config

**Why first:** Restores a working `npm run lint`, which is a gate for every subsequent task and for CI (I3). ESLint v10 dropped `.eslintrc.*` support, so lint is currently broken.

**Files:**
- Create: `eslint.config.mjs`
- Delete: `.eslintrc.js`
- Modify: `package.json` (devDependencies + scripts)

**Verification gate:** `npm run lint` exits 0 (after `--fix` auto-fixes) and `npx eslint . --no-fix` exits 0.

- [ ] **Step 1: Install flat-config deps, remove legacy ones**

Run:
```bash
npm i -D typescript-eslint @eslint/js
npm uninstall @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-prettier
```

Keep `eslint` (^10), `eslint-config-prettier` (^10). `typescript-eslint` (unified) provides parser + plugin + configs.

- [ ] **Step 2: Create `eslint.config.mjs`**

```js
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/migrations/seeds/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettier,
);
```

Rationale: non-type-checked `recommended` (matches the old `plugin:@typescript-eslint/recommended`); `eslint-config-prettier` last to disable formatting conflicts (formatting is owned by `prettier`, not lint). `no-explicit-any` off because the specs and existing mocks use `any`. Seeds ignored to avoid the pre-existing `no-console` seed noise (tracked separately).

- [ ] **Step 3: Delete `.eslintrc.js`**

```bash
git rm .eslintrc.js
```

- [ ] **Step 4: Confirm `lint` script (already correct) and run**

`package.json` `lint` is `eslint "{src,apps,libs,test}/**/*.ts" --fix` — keep it. Run:
```bash
npm run lint
```
Expected: exits 0 after auto-fixes. If errors remain on touched files, fix them inline (do NOT broaden ignores to silence real issues in `src/`).

- [ ] **Step 5: Verify no-fix is clean**

```bash
npx eslint . --no-fix
```
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs package.json package-lock.json
git commit -m "build(lint): migrate to eslint flat config (typescript-eslint) (I4)"
```

---

## Task 2: P1-bcrypt — Async bcrypt + cost 12 in login/register

**Files:**
- Modify: `src/auth/auth.service.ts:11,118-162,308-323`
- Modify: `src/auth/auth.service.spec.ts:75-77,123-125,148-150`
- Modify: `src/auth/auth.token-type.spec.ts:44-45,52-53`

- [ ] **Step 1: Update the `login` test spies to async `compare`**

In `src/auth/auth.service.spec.ts`, the "valid credentials" test (~L75-77) and "invalid password" test (~L123-125) currently spy on `compareSync`. Change both to:

```ts
const bcryptjs = await import('bcryptjs');
jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);
```

…and for the invalid-password test:

```ts
jest.spyOn(bcryptjs, 'compare').mockResolvedValue(false as never);
```

In `src/auth/auth.token-type.spec.ts`, change the two `compareSync` spies (~L44-45, L52-53) to `jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);`.

- [ ] **Step 2: Update the `register` test spy to async `hash`**

In `src/auth/auth.service.spec.ts` "should create user successfully" (~L148-150):

```ts
jest.spyOn(bcryptjs, 'hash').mockResolvedValue('hashed' as never);
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- src/auth/auth.service.spec.ts src/auth/auth.token-type.spec.ts
```
Expected: FAIL — `login`/`register` still call `compareSync`/`hashSync`, so the async spies are never hit; assertions depending on the result fail (e.g. login proceeds with `undefined` from `compareSync` because the spy is on `compare`).

- [ ] **Step 4: Migrate `login` and `register` to async bcrypt**

In `src/auth/auth.service.ts`:

Change the import (~L11) to drop the sync variants:
```ts
import { compare, hash } from 'bcryptjs';
```

In `login` (~L140), replace:
```ts
const isValid = compareSync(dto.password, user.password);
```
with:
```ts
const isValid = await compare(dto.password, user.password);
```

In `register` (~L314), replace:
```ts
const hashedPassword = hashSync(dto.password, 10);
```
with:
```ts
const hashedPassword = await hash(dto.password, 12);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- src/auth/auth.service.spec.ts src/auth/auth.token-type.spec.ts src/auth/auth.change-password.spec.ts
```
Expected: PASS (all auth specs; `change-password` already async, unaffected).

- [ ] **Step 6: Run full suite + lint**

```bash
npm test
npm run lint
```
Expected: PASS; lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts src/auth/auth.token-type.spec.ts
git commit -m "perf(auth): async bcrypt (compare/hash) + cost 12 in login/register (P1)"
```

---

## Task 3: S4 — `ensureNotLocked` in `refresh`

**Files:**
- Modify: `src/auth/auth.service.ts:164-215`
- Modify: `src/auth/auth.service.spec.ts` (add a `refresh` lockout test)

- [ ] **Step 1: Write the failing test**

Add a `describe('refresh', ...)` block to `src/auth/auth.service.spec.ts` (after the `register` block):

```ts
  describe('refresh', () => {
    it('throws UnauthorizedException when the user account is locked', async () => {
      const lockedUser = {
        id: 'u1',
        email: 't@x.com',
        roleId: 'r',
        isActive: true,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      };
      mockJwtService.verify.mockReturnValue({
        sub: 'u1',
        email: 't@x.com',
        tokenType: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      sessionRepo.findOne.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        refreshTokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        user: lockedUser,
      });
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      jest.spyOn(service as any, 'constantTimeCompare').mockReturnValue(true);
      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow(
        'Account locked due to too many failed attempts',
      );
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/auth/auth.service.spec.ts
```
Expected: FAIL — `refresh` currently does NOT check `lockedUntil`, so it proceeds to `rotateSession` (which calls `jwtService.sign` returning `undefined`, etc.) instead of throwing.

- [ ] **Step 3: Implement — add the lockout check in `refresh`**

In `src/auth/auth.service.ts`, inside `refresh`, after `const user = session.user;` (~L209) and before the `isActive` check, add:

```ts
    const lockNow = new Date();
    if (user.lockedUntil && user.lockedUntil > lockNow) {
      throw new UnauthorizedException(
        `Account locked due to too many failed attempts. Try again after ${user.lockedUntil.toISOString()}`,
      );
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/auth/auth.service.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts
git commit -m "feat(auth): enforce account lockout on refresh (S4)"
```

---

## Task 4: S7 — `select` without `password` in `findOne`/strategy

**Files:**
- Modify: `src/modules/rbac/entities/user.entity.ts:16-17`
- Modify: `src/users/users.service.ts:29-39`
- Modify: `src/users/users.service.spec.ts`
- Modify: `src/auth/auth.service.ts:123,332` (login/changePassword use `findOneWithPassword`)
- Modify: `src/auth/auth.service.spec.ts` (mock `findOneWithPassword`)
- Modify: `src/auth/auth.token-type.spec.ts` (mock `findOneWithPassword`)
- Modify: `src/auth/auth.change-password.spec.ts` (use `findOneWithPassword`/`findByIdWithPassword`)

- [ ] **Step 1: Write the failing tests**

In `src/users/users.service.spec.ts`, add (adjusting to the existing mock setup):

```ts
  it('findOne does not select the password column', async () => {
    usersRepository.findOne = jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com' });
    await service.findOne('t@x.com');
    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { email: 't@x.com' },
      select: expect.not.objectContaining({ password: true }),
    });
  });

  it('findOneWithPassword selects the password column', async () => {
    usersRepository.findOne = jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com', password: 'h' });
    const user = await service.findOneWithPassword('t@x.com');
    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { email: 't@x.com' },
      select: expect.objectContaining({ password: true }),
    });
    expect(user?.password).toBe('h');
  });
```

If the existing spec's `findOne` test asserts a plain `{ where: { email } }` call, update it to the new `select`-explicit shape.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/users/users.service.spec.ts
```
Expected: FAIL — `findOne` returns all columns (no `select`), and `findOneWithPassword` does not exist.

- [ ] **Step 3: Implement — mark `password` `select: false` and split the methods**

In `src/modules/rbac/entities/user.entity.ts` (~L16-17):

```ts
    @Column({ select: false })
    password: string;
```

In `src/users/users.service.ts`, replace `findOne` and add `findOneWithPassword` (and the `findById` pair):

```ts
  findOne(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
    });
  }

  findOneWithPassword(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      select: { id: true, email: true, name: true, password: true, roleId: true, isActive: true, lockedUntil: true, failedLoginAttempts: true },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findByIdWithPassword(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      select: { id: true, email: true, name: true, password: true, roleId: true, isActive: true, lockedUntil: true, failedLoginAttempts: true },
    });
  }
```

> Note: with `select: false` on the column, the plain `findOne`/`findById` automatically exclude `password`; the `WithPassword` variants explicitly re-select it. Adjust the `select` list to match the real `User` columns (verify against `user.entity.ts`).

- [ ] **Step 4: Use `findOneWithPassword` where the password is needed**

In `src/auth/auth.service.ts`:
- `login` (~L123): `const user = await this.usersService.findOneWithPassword(dto.email);`
- `changePassword` (~L332): `const user = await this.usersService.findByIdWithPassword(userId);`
- `register` existence check (~L309) stays on `findOne` (no password needed).
- `JwtStrategy.validate` (`src/auth/strategy/jwt.strategy.ts:26`) stays on `findOne` (no password needed) — now it no longer leaks `password` into `req.user`.

Update specs' mocks to provide `findOneWithPassword`/`findByIdWithPassword`:
- `src/auth/auth.service.spec.ts`: add `findOneWithPassword: jest.fn()` to `mockUsersService`; in `login` tests, mock `findOneWithPassword.mockResolvedValue(mockUser)` instead of `findOne`.
- `src/auth/auth.token-type.spec.ts`: in the `AuthService` `beforeEach`, add `findOneWithPassword: jest.fn().mockResolvedValue(...)` and use it for login.
- `src/auth/auth.change-password.spec.ts`: add `findByIdWithPassword: jest.fn().mockResolvedValue(...)` to the `users` mock.

- [ ] **Step 5: Run the auth + user suites**

```bash
npm test -- src/users/users.service.spec.ts src/auth
```
Expected: PASS.

- [ ] **Step 6: Run full suite + lint**

```bash
npm test
npm run lint
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/rbac/entities/user.entity.ts src/users/users.service.ts src/users/users.service.spec.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts src/auth/auth.token-type.spec.ts src/auth/auth.change-password.spec.ts src/auth/strategy/jwt.strategy.ts
git commit -m "feat(auth): exclude password from default user queries (S7)"
```

---

## Task 5: B3 — Assign role on `register`

**Files:**
- Modify: `src/auth/dto/register.dto.ts`
- Modify: `src/auth/auth.service.ts:308-323`
- Modify: `src/auth/auth.service.spec.ts` (register test)
- Modify: `src/auth/auth.module.ts` (import `RbacModule` or inject `RoleRepository`) — see Step 3.

- [ ] **Step 1: Write the failing test**

In `src/auth/auth.service.spec.ts`, update the "should create user successfully" test to expect a `roleId`. Add `findOneByName`/role lookup to the mock. First, change the assertion (~L155-160):

```ts
      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: registerDto.email,
        name: registerDto.name,
        password: 'hashed',
        roleId: 'viewer-role-uuid',
      });
```

And provide a role-lookup mock on the injected role repository (see Step 3 for the chosen shape). Use the simplest shape: inject `@InjectRepository(Role) private roleRepository` into `AuthService` and mock `roleRepository.findOne({ where: { name: 'Viewer' } })` → `{ id: 'viewer-role-uuid' }`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/auth/auth.service.spec.ts
```
Expected: FAIL — `register` does not pass `roleId`; `AuthService` has no `roleRepository`.

- [ ] **Step 3: Implement — resolve default role in `register`**

Add an optional `roleId` to `src/auth/dto/register.dto.ts`:

```ts
  @ApiPropertyOptional({ example: 'uuid-of-role', description: 'Role to assign. Defaults to "Viewer".' })
  @IsOptional()
  @IsUUID()
  roleId?: string;
```

In `src/auth/auth.service.ts`, inject `Role` repository:

```ts
import { Role } from '@/modules/rbac/entities/role.entity';
// ...
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
```

Rewrite `register` (~L308):

```ts
  async register(dto: RegisterDto) {
    const existing = await this.usersService.findOne(dto.email);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    let roleId = dto.roleId;
    if (!roleId) {
      const defaultRole = await this.roleRepository.findOne({ where: { name: 'Viewer' } });
      if (!defaultRole) {
        throw new InternalServerErrorException('Default role "Viewer" not found');
      }
      roleId = defaultRole.id;
    }

    const hashedPassword = await hash(dto.password, 12);

    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
      roleId,
    });

    return { message: 'User created with success', userId: user.id };
```

Add `InternalServerErrorException` to the `@nestjs/common` import. Register `Role` in `AuthModule`'s `TypeOrmModule.forFeature([...])` (add `Role` alongside `Session`).

- [ ] **Step 4: Provide the role repository in every spec that constructs `AuthService`**

`AuthService` now depends on `@InjectRepository(Role)`, so every `Test.createTestingModule` that provides `AuthService` must also provide `getRepositoryToken(Role)`, or Nest fails DI resolution.

In `src/auth/auth.service.spec.ts` `beforeEach`, add to the `TestingModule` providers:

```ts
        { provide: getRepositoryToken(Role), useValue: { findOne: jest.fn().mockResolvedValue({ id: 'viewer-role-uuid' }) } },
```

Import `Role` from `@/modules/rbac/entities/role.entity`. Keep `mockUsersService.create.mockResolvedValue({ id: 'new-uuid', ...registerDto, password: 'hashed', roleId: 'viewer-role-uuid' })`.

In `src/auth/auth.token-type.spec.ts` `beforeEach` (the `AuthService` describe), add to providers:

```ts
        { provide: getRepositoryToken(Role), useValue: { findOne: jest.fn().mockResolvedValue({ id: 'viewer-role-uuid' }) } },
```

(import `getRepositoryToken` from `@nestjs/typeorm` and `Role`.)

In `src/auth/auth.change-password.spec.ts` `beforeEach`, add the same `getRepositoryToken(Role)` provider (import `getRepositoryToken` and `Role`). `changePassword` does not use the role repo, but `AuthService` still requires it for construction.

- [ ] **Step 5: Run the tests**

```bash
npm test -- src/auth/auth.service.spec.ts
```
Expected: PASS.

- [ ] **Step 6: Run full suite + lint**

```bash
npm test
npm run lint
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/auth/dto/register.dto.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts src/auth/auth.module.ts
git commit -m "feat(auth): assign default role (Viewer) on register (B3)"
```

---

## Task 6: B2 — Remove orphaned TypeORM `cache:` options

**Files:**
- Modify: `src/modules/rbac/services/permission.service.ts:35`
- Modify: `src/modules/rbac/services/feature.service.ts:61`
- Modify: `src/modules/rbac/services/role.service.ts:58`

**Why:** The DataSource has no `cache` provider configured (see `src/config/database.ts`), so these `cache:` options are ineffective/no-op. RBAC permissions are already cached via Nest `CACHE_MANAGER`/Redis in `RbacService`. Removing avoids confusion and a latent error if TypeORM later enforces a cache provider.

**Verification gate:** `npm test` green (the RBAC specs use mocked repositories and don't depend on query cache) + `npx tsc --noEmit` clean.

- [ ] **Step 1: Remove `cache:` from the three queries**

In `src/modules/rbac/services/permission.service.ts` `findByFeature` (~L30-36), remove the `cache: 300000` line:

```ts
    async findByFeature(featureId: string): Promise<Permission[]> {
        return this.permissionRepository.find({
            where: { featureId },
            relations: ['feature'],
            order: { action: 'ASC' },
        });
    }
```

In `src/modules/rbac/services/feature.service.ts` `findOne` (~L57-62), remove `cache: 60000`:

```ts
    async findOne(id: string): Promise<Feature> {
        const feature = await this.featureRepository.findOne({
            where: { id },
            relations: ['permissions'],
        });
```

In `src/modules/rbac/services/role.service.ts` `findAll` (~L54-59), remove `cache: true`:

```ts
    async findAll(): Promise<Role[]> {
        return this.roleRepository.find({
            relations: ['rolePermissions', 'rolePermissions.permission', 'rolePermissions.permission.feature'],
            order: { name: 'ASC' },
        });
    }
```

- [ ] **Step 2: Verify**

```bash
npm test -- src/modules/rbac
npx tsc --noEmit
npm run lint
```
Expected: PASS; tsc clean; lint clean.

- [ ] **Step 3: Commit**

```bash
git add src/modules/rbac/services/permission.service.ts src/modules/rbac/services/feature.service.ts src/modules/rbac/services/role.service.ts
git commit -m "fix(rbac): remove ineffective TypeORM cache options (B2)"
```

---

## Task 7: S5 — DB SSL with CA + `rejectUnauthorized: true`

**Files:**
- Modify: `src/config/database.ts:19`
- Modify: `src/config/validation.schema.ts:36-43`
- Modify: `.env.example`

**Verification gate:** `npx tsc --noEmit` clean + `npm test` green + Joi schema accepts a `DB_SSL_CA`-set prod env (unit-test the schema if a `validation.schema.spec.ts` exists; otherwise verify by `node -e` requiring Joi).

- [ ] **Step 1: Update `database.ts` SSL**

In `src/config/database.ts` (~L19), replace:

```ts
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
```

with:

```ts
  ssl:
    process.env.DB_SSL === 'true'
      ? { ca: process.env.DB_SSL_CA, rejectUnauthorized: true }
      : false,
```

- [ ] **Step 2: Update the Joi schema**

In `src/config/validation.schema.ts`, alongside the `DB_SSL` rule (~L36-43), add:

```ts
  DB_SSL_CA: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().required().messages({
        'any.required': 'DB_SSL_CA is required when NODE_ENV=production and DB_SSL=true',
      }),
      otherwise: Joi.string().optional(),
    }),
```

- [ ] **Step 3: Document in `.env.example`**

Add (replace the existing `DB_SSL=false` line):

```
DB_SSL=false
DB_SSL_CA=     # PEM-encoded CA cert (required in production when DB_SSL=true)
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm test
```
Expected: tsc clean; tests pass (no spec reads `DB_SSL_CA`; the change is config-only).

- [ ] **Step 5: Commit**

```bash
git add src/config/database.ts src/config/validation.schema.ts .env.example
git commit -m "feat(config): DB SSL with CA + rejectUnauthorized in prod (S5)"
```

---

## Task 8: S6/D2 — `@nestjs/throttler` with strict login throttle (IP + email)

**Files:**
- Modify: `package.json` (add `@nestjs/throttler`)
- Create: `src/auth/throttlers/login-throttle.util.ts`
- Create: `src/auth/throttlers/login-throttle.util.spec.ts`
- Modify: `src/app.module.ts`
- Modify: `src/main.ts` (remove `express-rate-limit`)
- Modify: `src/auth/auth.controller.ts` (decorate `login`)
- Modify: `src/auth/auth.controller.spec.ts` if it asserts rate-limit behavior (it does not; no change expected)

- [ ] **Step 1: Install `@nestjs/throttler`**

```bash
npm i @nestjs/throttler
```

- [ ] **Step 2: Write the failing test for the key helper**

Create `src/auth/throttlers/login-throttle.util.spec.ts`:

```ts
import { buildLoginThrottleKey } from './login-throttle.util';

describe('buildLoginThrottleKey (S6)', () => {
  it('combines IP and email into a stable key', () => {
    expect(buildLoginThrottleKey('1.2.3.4', 'a@b.com')).toBe('login:1.2.3.4:a@b.com');
  });
  it('lowercases the email', () => {
    expect(buildLoginThrottleKey('1.2.3.4', 'A@B.COM')).toBe('login:1.2.3.4:a@b.com');
  });
  it('handles missing email (unparsed body)', () => {
    expect(buildLoginThrottleKey('1.2.3.4', undefined)).toBe('login:1.2.3.4:');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -- src/auth/throttlers/login-throttle.util.spec.ts
```
Expected: FAIL — module `./login-throttle.util` does not exist.

- [ ] **Step 4: Implement the helper**

Create `src/auth/throttlers/login-throttle.util.ts`:

```ts
export function buildLoginThrottleKey(ip: string | undefined, email: string | undefined): string {
  return `login:${ip ?? ''}:${(email ?? '').toLowerCase()}`;
}
```

- [ ] **Step 5: Run the helper test to verify it passes**

```bash
npm test -- src/auth/throttlers/login-throttle.util.spec.ts
```
Expected: PASS (3 tests).

- [ ] **Step 6: Wire `ThrottlerModule` + global `ThrottlerGuard`**

In `src/app.module.ts`, add imports and register (place `ThrottlerModule` before `RbacModule`):

```ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
// ...
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'login', ttl: 60_000, limit: 10 },
    ]),
// ...
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
```

> Note: `JwtAuthGuard` APP_GUARD is added in Task 9 (S10). When both are present, register `ThrottlerGuard` first (so floods are rejected before JWT work).

- [ ] **Step 7: Remove `express-rate-limit` from `main.ts`**

In `src/main.ts`, delete the `import rateLimit from 'express-rate-limit';` (L5) and the `app.use(rateLimit({...}))` block (L28-36). Then:

```bash
npm uninstall express-rate-limit
```

- [ ] **Step 8: Decorate `/auth/login` with the strict `login` throttler**

In `src/auth/auth.controller.ts`, add imports and decorate `login`:

```ts
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { buildLoginThrottleKey } from './throttlers/login-throttle.util';
import type { ExecutionContext } from '@nestjs/common';
// ...
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ default: true })
  @Throttle({
    login: {
      limit: 10,
      ttl: 60_000,
      getTracker: (req: Record<string, any>) => req.ip ?? req.socket?.remoteAddress ?? '',
      generateKey: (ctx: ExecutionContext, tracker: string) => {
        const req = ctx.switchToHttp().getRequest();
        return buildLoginThrottleKey(tracker, req.body?.email);
      },
    },
  })
  @ApiOperation({ /* ...existing... */ })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket?.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.authService.login(dto, ip, userAgent);
  }
```

- [ ] **Step 9: Verify**

```bash
npm test
npm run lint
```
Expected: PASS; lint clean. (Full 429 behavior is verified by e2e in Task 12 / I3.)

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/auth/throttlers src/app.module.ts src/main.ts src/auth/auth.controller.ts
git commit -m "feat(security): @nestjs/throttler with strict IP+email login throttle (S6/D2)"
```

---

## Task 9: S10/F5 — Global default-deny guard + `@Public()`

**Files:**
- Create: `src/common/decorators/public.decorator.ts`
- Modify: `src/auth/strategy/jwt-auth.guard.ts`
- Create: `src/auth/strategy/jwt-auth.guard.spec.ts`
- Modify: `src/app.module.ts` (register `JwtAuthGuard` APP_GUARD)
- Modify: `src/app.controller.ts` (`@Public()` on `getHello`)
- Modify: `src/auth/auth.controller.ts` (`@Public()` on `login`, `refresh`)
- Modify: `src/modules/health/health.controller.ts` (`@Public()` on liveness/readiness)

- [ ] **Step 1: Write the failing test for the guard**

Create `src/auth/strategy/jwt-auth.guard.spec.ts`:

```ts
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard (S10)', () => {
  it('allows routes marked @Public() without a token', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true); // IS_PUBLIC_KEY = true
    const guard = new JwtAuthGuard(reflector);
    const ctx = { getHandler: () => ({}), getClass: () => ({}) } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('delegates to Passport (super) for non-public routes', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    const guard = new JwtAuthGuard(reflector);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/auth/strategy/jwt-auth.guard.spec.ts
```
Expected: FAIL — `JwtAuthGuard` does not read `IS_PUBLIC_KEY` (constructor signature mismatch / no bypass).

- [ ] **Step 3: Create the `@Public()` decorator**

Create `src/common/decorators/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 4: Make `JwtAuthGuard` honor `@Public()`**

Edit `src/auth/strategy/jwt-auth.guard.ts` to:

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
```

> Note: `JwtAuthGuard` is currently applied via `@UseGuards(JwtAuthGuard)` on several routes. Those keep working. If `JwtAuthGuard` was previously constructed without `Reflector` (Nest DI provides it automatically for `@Injectable` guards), adding the constructor is safe — Nest injects `Reflector`.

- [ ] **Step 5: Register `JwtAuthGuard` as a global guard**

In `src/app.module.ts`, add the second APP_GUARD (after the `ThrottlerGuard` from Task 8):

```ts
import { JwtAuthGuard } from './auth/strategy/jwt-auth.guard';
// ...
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
```

- [ ] **Step 6: Mark public routes**

- `src/app.controller.ts`: add `@Public()` to `getHello`:
```ts
  @Get()
  @Public()
  getHello(): object {
    return this.appService.getHello();
  }
```
- `src/auth/auth.controller.ts`: add `@Public()` to `login` and `refresh`.
- `src/modules/health/health.controller.ts`: add `@Public()` to `liveness` and `readiness`.

- [ ] **Step 7: Run the guard test + full suite**

```bash
npm test -- src/auth/strategy/jwt-auth.guard.spec.ts
npm test
npm run lint
```
Expected: PASS. Watch for specs that bootstrap `AppModule` (`test/app.e2e-spec.ts`) — they may now require auth for previously-open routes; that is expected and addressed in Task 12 (I3) where e2e is reworked. Unit specs do not bootstrap `AppModule`, so they stay green.

- [ ] **Step 8: Commit**

```bash
git add src/common/decorators/public.decorator.ts src/auth/strategy/jwt-auth.guard.ts src/auth/strategy/jwt-auth.guard.spec.ts src/app.module.ts src/app.controller.ts src/auth/auth.controller.ts src/modules/health/health.controller.ts
git commit -m "feat(security): global default-deny JwtAuthGuard + @Public() (S10/F5)"
```

---

## Task 10: S9/F2 — `logout` / `logout-all` + `jti` denylist

**Files:**
- Modify: `src/modules/auth/entities/session.entity.ts` (add `jti`)
- Create: `src/migrations/<ts>-AddSessionJti.ts`
- Modify: `src/auth/auth.service.ts` (sign `jti`; `logout`/`logoutAll`; store `jti` on session)
- Modify: `src/auth/auth.controller.ts` (new endpoints)
- Modify: `src/auth/strategy/jwt.strategy.ts` (denylist check)
- Modify: `src/auth/auth.service.spec.ts` (logout tests)
- Modify: `src/auth/auth.controller.spec.ts` (logout route tests)
- Modify: `src/auth/auth.token-type.spec.ts` (assert `jti` present)
- Modify: `src/auth/auth.module.ts` (ensure `CACHE_MANAGER` available to strategy)

- [ ] **Step 1: Write the failing service tests**

In `src/auth/auth.service.spec.ts`, add a `describe('logout', ...)`:

```ts
  describe('logout', () => {
    it('denylists the access jti and revokes the matching session', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      (service as any).cacheManager = { set: setSpy, get: jest.fn().mockResolvedValue(undefined) };
      sessionRepo.findOne.mockResolvedValue({ id: 's1', userId: 'u1', refreshTokenHash: 'h', revokedAt: null });
      sessionRepo.save = jest.fn().mockResolvedValue(undefined);

      await service.logout('u1', 'access-jti-1', 'refresh-token-1');

      expect(setSpy).toHaveBeenCalledWith('jti:access-jti-1', expect.anything(), expect.any(Number));
      expect(sessionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', revokedAt: expect.any(Date) }));
    });

    it('logoutAll revokes every active session of the user and denylists the jti', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      const executeMock = jest.fn().mockResolvedValue({ affected: 3 });
      (service as any).cacheManager = { set: setSpy };
      sessionRepo.createQueryBuilder = jest.fn(() => ({
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: executeMock })) })) })),
      })) as any;

      await service.logoutAll('u1', 'access-jti-1');

      expect(setSpy).toHaveBeenCalledWith('jti:access-jti-1', expect.anything(), expect.any(Number));
      expect(executeMock).toHaveBeenCalled();
    });
  });
```

And in `src/auth/auth.token-type.spec.ts`, add an assertion that the access token carries a `jti`:

```ts
    it('access token is signed with a jti claim', async () => {
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);
      await service.login({ email: 't@x.com', password: 'p' });
      const accessCall = jwt.sign.mock.calls.find((c: any[]) => c[0]?.tokenType === 'access');
      expect(accessCall?.[0]?.jti).toEqual(expect.any(String));
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/auth/auth.service.spec.ts src/auth/auth.token-type.spec.ts
```
Expected: FAIL — `logout`/`logoutAll` don't exist; tokens have no `jti`.

- [ ] **Step 3: Add `jti` to the `Session` entity**

In `src/modules/auth/entities/session.entity.ts`, add (inside the class):

```ts
  @Column({ type: 'uuid', nullable: true })
  jti: string | null;
```

- [ ] **Step 4: Create the migration**

```bash
npx typeorm migration:create src/migrations/AddSessionJti
```

Then edit the generated file (`src/migrations/<timestamp>-AddSessionJti.ts`):

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionJti<Timestamp> implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" ADD "jti" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "jti"`);
  }
}
```

(Replace `<Timestamp>` in the class name with the actual timestamp the CLI generated.)

- [ ] **Step 5: Sign `jti` and persist it on the session**

In `src/auth/auth.service.ts`, import `randomUUID` from `crypto` (extend the existing `crypto` import):

```ts
import { createHash, timingSafeEqual, randomUUID } from 'crypto';
```

Add a constant:

```ts
const ACCESS_TOKEN_EXPIRES_MS = 15 * 60 * 1000;
```

In `createTokensAndSession` (~L217-258) and `rotateSession` (~L260-306), generate a `jti` and include it in both token payloads + the session row. For `createTokensAndSession`:

```ts
    const payload = { sub: user.id, email: user.email, roleId: user.roleId };
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const accessToken = this.jwtService.sign(
      { ...payload, tokenType: 'access', jti: accessJti },
      { expiresIn: ACCESS_TOKEN_EXPIRES, algorithm: 'RS256' },
    );
    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: 'refresh', jti: refreshJti },
      { expiresIn: REFRESH_TOKEN_EXPIRES, algorithm: 'RS256' },
    );

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
      jti: refreshJti,
    });
    await this.sessionRepository.save(session);
```

Apply the equivalent change in `rotateSession` (store `jti: refreshJti` on `newSession`).

- [ ] **Step 6: Inject `CACHE_MANAGER` and implement `logout` / `logoutAll`**

In `src/auth/auth.service.ts`, import and inject:

```ts
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
// ...
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
```

`AuthService` now also depends on `CACHE_MANAGER`. Add a `CACHE_MANAGER` provider to every spec that constructs `AuthService` (same reason as the role repo in Task 5):

In `src/auth/auth.service.spec.ts`, `src/auth/auth.token-type.spec.ts`, and `src/auth/auth.change-password.spec.ts` `beforeEach`, add to providers:

```ts
        { provide: CACHE_MANAGER, useValue: { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) } },
```

(import `CACHE_MANAGER` from `@nestjs/cache-manager`.)

Add the methods:

```ts
  async logout(userId: string, accessJti: string, refreshToken?: string): Promise<void> {
    await this.cacheManager.set(`jti:${accessJti}`, 1, ACCESS_TOKEN_EXPIRES_MS);
    if (refreshToken) {
      const tokenHash = this.hashRefreshToken(refreshToken);
      const session = await this.sessionRepository.findOne({ where: { refreshTokenHash: tokenHash } });
      if (session && !session.revokedAt) {
        session.revokedAt = new Date();
        await this.sessionRepository.save(session);
      }
    }
  }

  async logoutAll(userId: string, accessJti: string): Promise<void> {
    await this.cacheManager.set(`jti:${accessJti}`, 1, ACCESS_TOKEN_EXPIRES_MS);
    await this.sessionRepository
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: () => 'NOW()' })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }
```

- [ ] **Step 7: Reject denylisted `jti` in `JwtStrategy`**

In `src/auth/strategy/jwt.strategy.ts`, inject `CACHE_MANAGER` and check the denylist after loading the user:

```ts
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
// ...
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) { /* ...super({...})... */ }
```

In `validate`, after `if (payload.tokenType !== 'access') {...}` and before `usersService.findOne`:

```ts
    const denied = await this.cacheManager.get(`jti:${payload.jti}`);
    if (denied) {
      throw new UnauthorizedException('Token has been revoked');
    }
```

Update the `payload` type to include `jti: string`. Update the existing `auth.token-type.spec.ts` `JwtStrategy` tests to provide a `cacheManager: { get: jest.fn().mockResolvedValue(undefined) }` and a `jti` in the payload.

- [ ] **Step 8: Add the controller endpoints**

In `src/auth/auth.controller.ts`:

```ts
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout', description: 'Revokes the current session and denylists the access token.' })
  @ApiOkResponse({ description: 'Logged out' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async logout(@Req() req: Request & { user?: { id: string; jti?: string } }, @Body() dto: LogoutDto) {
    await this.authService.logout(req.user!.id, req.user!.jti!, dto.refresh_token);
    return { message: 'Logged out' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions', description: 'Revokes all sessions for the user and denylists the access token.' })
  @ApiOkResponse({ description: 'All sessions revoked' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async logoutAll(@Req() req: Request & { user?: { id: string; jti?: string } }) {
    await this.authService.logoutAll(req.user!.id, req.user!.jti!);
    return { message: 'All sessions revoked' };
  }
```

Create `src/auth/dto/logout.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token of the session to revoke' })
  @IsOptional()
  @IsString()
  refresh_token?: string;
}
```

- [ ] **Step 9: Add controller tests**

In `src/auth/auth.controller.spec.ts`, add `logout`/`logoutAll` to `mockAuthService` and two tests:

```ts
  describe('logout', () => {
    it('calls authService.logout with userId, jti and refresh_token', async () => {
      mockAuthService.logout = jest.fn().mockResolvedValue(undefined);
      const req: any = { user: { id: 'u1', jti: 'jti-1' } };
      const res = await controller.logout(req, { refresh_token: 'rt' });
      expect(mockAuthService.logout).toHaveBeenCalledWith('u1', 'jti-1', 'rt');
      expect(res).toEqual({ message: 'Logged out' });
    });

    it('logoutAll calls authService.logoutAll with userId and jti', async () => {
      mockAuthService.logoutAll = jest.fn().mockResolvedValue(undefined);
      const req: any = { user: { id: 'u1', jti: 'jti-1' } };
      const res = await controller.logoutAll(req);
      expect(mockAuthService.logoutAll).toHaveBeenCalledWith('u1', 'jti-1');
      expect(res).toEqual({ message: 'All sessions revoked' });
    });
  });
```

- [ ] **Step 10: Run the suites**

```bash
npm test -- src/auth
npm run lint
```
Expected: PASS; lint clean.

- [ ] **Step 11: Commit**

```bash
git add src/modules/auth/entities/session.entity.ts src/migrations src/auth/auth.service.ts src/auth/auth.controller.ts src/auth/strategy/jwt.strategy.ts src/auth/auth.service.spec.ts src/auth/auth.controller.spec.ts src/auth/auth.token-type.spec.ts src/auth/dto/logout.dto.ts
git commit -m "feat(auth): logout/logout-all + jti denylist (S9/F2)"
```

---

## Task 11: S11 — Atomic refresh rotation (transaction + pessimistic lock)

**Files:**
- Modify: `src/auth/auth.service.ts:164-306` (`refresh`, `rotateSession`, `revokeSessionFamilyAndLogReuse`)
- Modify: `src/auth/auth.service.spec.ts` (assert transaction + lock usage)

- [ ] **Step 1: Write the failing test**

In `src/auth/auth.service.spec.ts`, add a `refresh` test asserting the transaction + lock are used:

```ts
    it('rotates the session inside a transaction with a pessimistic_write lock', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'u1', email: 't@x.com', tokenType: 'refresh', jti: 'rjti', exp: Math.floor(Date.now()/1000)+3600,
      });
      const lockedSession = {
        id: 's1', userId: 'u1', refreshTokenHash: 'hash', revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 'u1', email: 't@x.com', roleId: 'r', isActive: true, lockedUntil: null },
      };
      const emFindOne = jest.fn().mockResolvedValue(lockedSession);
      const emSave = jest.fn().mockResolvedValue(undefined);
      const emCreate = jest.fn((x) => x);
      const txMock = jest.fn(async (cb: any) => cb({
        findOne: emFindOne,
        save: emSave,
        create: emCreate,
        getRepository: () => ({ create: emCreate, save: emSave }),
      }));
      sessionRepo.manager = { transaction: txMock } as any;
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      jest.spyOn(service as any, 'constantTimeCompare').mockReturnValue(true);
      mockJwtService.sign.mockReturnValue('tok');

      await service.refresh({ refresh_token: 't' });

      expect(txMock).toHaveBeenCalled();
      expect(emFindOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { refreshTokenHash: 'hash' }, lock: { mode: 'pessimistic_write' } }),
      );
      expect(emSave).toHaveBeenCalledTimes(2); // revoke old + create new
    });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/auth/auth.service.spec.ts
```
Expected: FAIL — `refresh` uses `sessionRepository.findOne` (no transaction, no lock).

- [ ] **Step 3: Implement — transactional `refresh` with lock**

Refactor `refresh` to run the critical section inside `this.sessionRepository.manager.transaction`. The full updated `refresh`:

```ts
  async refresh(
    dto: RefreshDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const token = dto.refresh_token;
    if (!token) {
      throw new UnauthorizedException('Refresh token required');
    }

    let payload: { sub: string; email: string; roleId?: string; tokenType: 'access' | 'refresh'; jti?: string; exp: number };
    try {
      payload = this.jwtService.verify(token, { algorithms: ['RS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }

    const tokenHash = this.hashRefreshToken(token);

    return this.sessionRepository.manager.transaction(async (em) => {
      const session = await em.findOne(Session, {
        where: { refreshTokenHash: tokenHash },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!session) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (!this.constantTimeCompare(tokenHash, session.refreshTokenHash)) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const now = new Date();
      if (session.revokedAt) {
        await this.revokeSessionFamilyAndLogReuse(session, ip, userAgent, em);
        throw new UnauthorizedException('Refresh token reuse detected. All sessions have been revoked.');
      }
      if (session.expiresAt < now) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const user = session.user;
      if (!user.isActive) {
        throw new UnauthorizedException('User account is deactivated');
      }
      if (user.lockedUntil && user.lockedUntil > now) {
        throw new UnauthorizedException(
          `Account locked due to too many failed attempts. Try again after ${user.lockedUntil.toISOString()}`,
        );
      }

      session.revokedAt = new Date();
      await em.save(session);

      const basePayload = { sub: user.id, email: user.email, roleId: user.roleId };
      const accessJti = randomUUID();
      const refreshJti = randomUUID();
      const accessToken = this.jwtService.sign(
        { ...basePayload, tokenType: 'access', jti: accessJti },
        { expiresIn: ACCESS_TOKEN_EXPIRES, algorithm: 'RS256' },
      );
      const refreshToken = this.jwtService.sign(
        { ...basePayload, tokenType: 'refresh', jti: refreshJti },
        { expiresIn: REFRESH_TOKEN_EXPIRES, algorithm: 'RS256' },
      );
      const newHash = this.hashRefreshToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const newSession = em.create(Session, {
        userId: user.id,
        refreshTokenHash: newHash,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
        jti: refreshJti,
        rotatedFromSessionId: session.id,
      });
      await em.save(newSession);

      return { email: user.email, access_token: accessToken, refresh_token: refreshToken };
    });
  }
```

Update `revokeSessionFamilyAndLogReuse` to accept an optional `em` and use it for the bulk revoke:

```ts
  private async revokeSessionFamilyAndLogReuse(
    reusedSession: Session,
    ip?: string,
    userAgent?: string,
    em?: EntityManager,
  ): Promise<void> {
    const userId = reusedSession.userId;
    const sessionFamilyIds = await this.getSessionFamilyIds(reusedSession);

    const repo = em ? em.getRepository(Session) : this.sessionRepository;
    const result = await repo
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: () => 'NOW()' })
      .where('user_id = :userId', { userId })
      .execute();

    this.logger.warn(
      `Refresh token reuse detected for user ${userId}, session ${reusedSession.id}. Revoked ${result.affected ?? 0} sessions.`,
    );

    await this.auditLogService.log({
      action: 'auth.refresh_token_reuse_detected',
      entityType: 'Session',
      entityId: reusedSession.id,
      actorUserId: userId,
      metadata: { reusedSessionId: reusedSession.id, revokedSessionCount: result.affected ?? 0, sessionFamilyIds },
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
  }
```

Add `EntityManager` to the typeorm import:

```ts
import { In, Repository, EntityManager } from 'typeorm';
```

> Note: the old `rotateSession` private method can be removed (its logic is now inlined in the transaction) OR kept for `createTokensAndSession`'s separate path. `createTokensAndSession` (login) does NOT need a transaction (no row contention). Keep `createTokensAndSession` as-is; delete `rotateSession` if now unused to avoid dead code (verify with `npm run lint` — `no-unused-vars` will flag it).

- [ ] **Step 4: Run the tests**

```bash
npm test -- src/auth
```
Expected: PASS.

- [ ] **Step 5: Run full suite + lint**

```bash
npm test
npm run lint
```
Expected: PASS; lint clean (if `rotateSession` is now unused, remove it).

- [ ] **Step 6: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts
git commit -m "feat(auth): atomic refresh rotation with pessimistic lock (S11)"
```

---

## Task 12: I3 — CI pipeline (lint + tsc + test + e2e with Testcontainers + npm audit)

**Files:**
- Modify: `package.json` (add `test:e2e` script + Testcontainers devDeps)
- Modify: `test/app.e2e-spec.ts` (Testcontainers bootstrap; mark public-route expectations)
- Create: `.github/workflows/ci.yml`

**Verification gate:** `npm run test:e2e` passes locally (requires Docker) and the workflow file is syntactically valid.

- [ ] **Step 1: Install Testcontainers devDeps**

```bash
npm i -D @testcontainers/postgresql @testcontainers/redis
```

- [ ] **Step 2: Add `test:e2e` script**

In `package.json` `scripts`, add:

```json
    "test:e2e": "jest --config test/jest-e2e.json",
```

- [ ] **Step 3: Rework `test/app.e2e-spec.ts` to bootstrap with Testcontainers**

Replace the file with a Testcontainers-driven bootstrap (using random DB credentials, running migrations, seeding the default roles so `register`'s `Viewer` lookup works):

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { dataSourceOptions } from '../src/config/database';
import { seedRbac } from '../src/migrations/seeds/rbac.seed';

describe('AppModule e2e (I3)', () => {
  let app: INestApplication;
  let pg: PostgreSqlContainer;
  let redis: RedisContainer;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redis = await new RedisContainer('redis:7-alpine').start();

    process.env.DB_HOST = pg.getHost();
    process.env.DB_PORT = String(pg.getMappedPort(5432));
    process.env.DB_USERNAME = pg.getUsername();
    process.env.DB_PASSWORD = pg.getPassword();
    process.env.DB_DATABASE = pg.getDatabase();
    process.env.DB_SSL = 'false';
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.NODE_ENV = 'test';
    process.env.PRIVATE_KEY = process.env.PRIVATE_KEY ?? '-----BEGIN RSA PRIVATE KEY-----\n...test key...\n-----END RSA PRIVATE KEY-----';
    process.env.PUBLIC_KEY = process.env.PUBLIC_KEY ?? '-----BEGIN PUBLIC KEY-----\n...test key...\n-----END PUBLIC KEY-----';
    process.env.ALLOWED_ORIGINS = '*';

    const ds = new DataSource({ ...dataSourceOptions, synchronize: false });
    await ds.initialize();
    await ds.runMigrations({ transaction: 'each' });
    await seedRbac(ds);
    await ds.destroy();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await redis?.stop();
    await pg?.stop();
  });

  it('GET / is public and returns hello', async () => {
    const res = await app.getHttpServer().get('/');
    expect(res.status).toBe(200);
  });

  it('GET /health/liveness is public', async () => {
    const res = await app.getHttpServer().get('/health/liveness');
    expect(res.status).toBe(200);
  });

  it('protected route without token returns 401 (default-deny)', async () => {
    const res = await app.getHttpServer().get('/premium-echo');
    expect(res.status).toBe(401);
  });
});
```

> Note: replace the test RSA key placeholders with a generated test keypair (store in `test/keys/` or inline). If generating keys is onerous, read them from `test/keys/test-private.pem` / `test/keys/test-public.pem` and create those files with `openssl genrsa -out test/keys/test-private.pem 2048; openssl rsa -in test/keys/test-private.pem -pubout -out test/keys/test-public.pem`.

- [ ] **Step 4: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test -- --ci

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:e2e -- --ci
        env:
          PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
          PUBLIC_KEY: ${{ secrets.PUBLIC_KEY }}

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci --omit=dev
      - run: npm audit --omit=dev --audit-level=high
```

> Note: Testcontainers needs Docker, available on GitHub-hosted `ubuntu-latest` runners. The `audit` job uses `--omit=dev` to focus on production deps.

- [ ] **Step 5: Verify locally (requires Docker)**

```bash
npm run test:e2e
```
Expected: PASS (3 tests). If Docker is unavailable locally, record this as `DONE_WITH_CONCERNS` and rely on CI.

- [ ] **Step 6: Run unit suite + lint**

```bash
npm test
npm run lint
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json test/app.e2e-spec.ts .github/workflows/ci.yml
git commit -m "ci: add lint+tsc+test+e2e(testcontainers)+audit pipeline (I3)"
```

---

## Final verification

- [ ] **Run the full unit suite**
```bash
npm test
```
Expected: PASS (all specs; new specs for throttler util, jwt-auth guard, logout, atomic refresh, password projection, register role).

- [ ] **Run lint + typecheck**
```bash
npm run lint
npx tsc --noEmit
```
Expected: clean.

- [ ] **Run e2e (Docker required)**
```bash
npm run test:e2e
```
Expected: PASS.

- [ ] **Run migrations against a fresh DB**
```bash
npm run migration:run
```
Expected: the `AddSessionJti` migration applies cleanly (note: `migration:*` scripts use `yarn`; if `yarn` is unavailable, run via `npm run typeorm migration:run -- -d src/config/database.ts`).

---

## Out-of-scope reminders (do NOT do in this plan)

- **P2/P3** items (soft-delete vs unique, recursive CTE revocation, dead-code cleanup, audit compliance C1–C4, health-Redis reuse, async audit queue, session purge cron, password policy, multi-tenant decision).
- **Throttler Redis storage** (`@nest-lab/throttler-storage-redis` / `rate-limit-redis`) — the plan uses the default in-memory store; multi-instance Redis-backed throttling is a follow-up.
- **Full RBAC default-deny for permissions** (permission guard stays opt-in via `@RequirePermissions`); only the JWT default-deny + `@Public()` is in scope (S10/F5).
- **Access-token `jti` denylist for `logoutAll` across all previously-issued access tokens** — only the current access token's `jti` is denylisted (sufficient because access tokens are short-lived 15m).
- **Removing `yarn` references from `migration:*` scripts** — out of scope; noted as a separate cleanup.

---

## Notes for the executor

- **Task order is intentional:** I4 first (lint gate), then small isolated auth changes (P1-bcrypt, S4, S7, B3, B2, S5), then the larger security features (S6, S10, S9, S11), then I3 (which depends on lint + e2e infra being ready). S9 and S11 both touch `auth.service.ts` token-signing and the `refresh`/`rotate` flow — implement S9 (jti) before S11 (atomic) so the atomic rewrite already includes `jti`.
- **`@Public()` interaction with throttler:** both `ThrottlerGuard` and `JwtAuthGuard` are `APP_GUARD`s; Nest runs them in registration order. `ThrottlerGuard` must be registered first so unauthenticated floods are rejected before JWT verification. `@Public()` only bypasses `JwtAuthGuard`, not the throttler — public routes are still rate-limited (desired).
- **Cache manager availability:** the global `CacheModule` (from P0/S3) provides `CACHE_MANAGER` app-wide; `JwtStrategy` and `AuthService` can inject it without extra module wiring.
- **Test RSA keys for e2e:** generate a throwaway keypair for `test/keys/` — never commit real keys.
- **`randomUUID`** is from Node's `crypto` (already imported for `createHash`).
