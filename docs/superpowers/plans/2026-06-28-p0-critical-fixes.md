# P0 Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 4 critical blockers from `docs/ANALISE_PROFUNDA.md` (S1 refresh-as-access, S2 passwordless changePassword, S3 broken RBAC cache, I1 broken Dockerfile) plus repair the two broken unit specs (B1, B21), leaving the test suite green and the Docker image buildable.

**Architecture:**
- **S1** — add a `tokenType: 'access' | 'refresh'` claim to JWTs and reject the wrong type in `JwtStrategy.validate` and `AuthService.refresh`.
- **S2** — require `currentPassword` on `changePassword`, verified with async `bcrypt.compare` before accepting the new password.
- **S3** — replace the invalid local `CacheModule.register({ttl,max})` with a global `CacheModule` using a Keyv store (Redis when `REDIS_HOST` is set, in-memory fallback otherwise), via a pure testable factory function.
- **I1** — rewrite the Dockerfile to use `npm ci` (no `yarn.lock` exists in the repo).
- **B1/B21** — repair `auth.service.spec.ts` (missing providers + wrong assertion) and `app.controller.spec.ts` (calls non-existent `getEcho`).

**Tech Stack:** NestJS 11, `@nestjs/jwt` 11, `@nestjs/cache-manager` ^3 + `cache-manager` ^7 (Keyv), `@keyv/redis`, `keyv`, `cacheable`, `bcryptjs` ^3 (async API), Jest 30 / ts-jest 29, Docker (`node:20-alpine`).

**Scope note:** This plan covers ONLY the P0 items. P1/P2/P3 items (throttler, logout, audit compliance, CI, etc.) are separate plans per the analysis roadmap. Do not expand scope.

**TDD discipline (chosen by user: strict):** Every task writes a failing test first, runs it red, implements the minimum to pass, runs it green, then commits. Infra task (I1) uses `docker build` success/failure as its verification gate.

**Baseline:** Before starting, confirm the repo is on `master` and clean (`git status`). Tests currently are partially red (B1/B21); the plan fixes those first to establish a green baseline before TDD-ing new behavior.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app.controller.spec.ts` | Modify | Remove the `getEcho` describe block (B21). |
| `src/auth/auth.service.spec.ts` | Modify | Repair DI providers + assertion to match real `AuthService` (B1). |
| `src/auth/auth.service.ts` | Modify | Sign `tokenType` claim (S1); require `currentPassword` in `changePassword` (S2). |
| `src/auth/strategy/jwt.strategy.ts` | Modify | Reject `tokenType !== 'access'` in `validate` (S1). |
| `src/auth/auth.controller.ts` | Modify | Pass `dto.currentPassword` to service (S2). |
| `src/auth/dto/change-password.dto.ts` | Modify | Add `currentPassword` field (S2). |
| `src/auth/auth.token-type.spec.ts` | Create | TDD tests for S1 (tokenType in tokens + cross-rejection). |
| `src/auth/auth.change-password.spec.ts` | Create | TDD tests for S2 (currentPassword verification). |
| `src/config/cache-stores.factory.ts` | Create | Pure factory `buildCacheStores(cfg)` → Keyv stores (S3). |
| `src/config/cache-stores.factory.spec.ts` | Create | TDD tests for `buildCacheStores` (S3). |
| `src/app.module.ts` | Modify | Register global `CacheModule` with factory (S3). |
| `src/modules/rbac/rbac.module.ts` | Modify | Remove local `CacheModule.register` (S3). |
| `package.json` | Modify | Add `@keyv/redis`, `keyv`, `cacheable` (S3). |
| `Dockerfile` | Modify | Rewrite to `npm ci` (I1). |

---

## Task 1: Repair `app.controller.spec.ts` (B21)

**Files:**
- Modify: `src/app.controller.spec.ts:55-63`

**Why first:** `app.controller.spec.ts` calls `appController.getEcho(body)`, but `AppController` has no `getEcho` method → `TypeError`. Fixing this removes one red spec before introducing new behavior.

- [ ] **Step 1: Run the spec to confirm it fails**

Run: `npm test -- src/app.controller.spec.ts`
Expected: FAIL — `TypeError: appController.getEcho is not a function` (in the `getEcho` describe block).

- [ ] **Step 2: Remove the broken `getEcho` describe block**

In `src/app.controller.spec.ts`, delete the entire block:

```ts
  describe('getEcho', () => {
    it('should echo the request body', () => {
      const body = { message: 'test' };

      const result = appController.getEcho(body);

      expect(result).toEqual(body);
    });
  });
```

Leave `getHello` and `getPremiumEcho` describes intact.

- [ ] **Step 3: Run the spec to confirm it passes**

Run: `npm test -- src/app.controller.spec.ts`
Expected: PASS (the remaining `root`/`getHello` and `getPremiumEcho` tests; the broken `getEcho` block is gone).

- [ ] **Step 4: Commit**

```bash
git add src/app.controller.spec.ts
git commit -m "test: remove broken getEcho case from AppController spec (B21)"
```

---

## Task 2: Repair `auth.service.spec.ts` (B1)

**Files:**
- Modify: `src/auth/auth.service.spec.ts`

**Why:** The spec provides only `JwtService` + `UsersService`, but `AuthService` also requires `AuditLogService` and `@InjectRepository(Session)`. The assertion at `:77-81` expects `sign` called with 1 arg, but the real call is `sign(payload, options)`. Repair to the CURRENT contract first (S1/S2 will extend it later).

- [ ] **Step 1: Run the spec to confirm it fails**

Run: `npm test -- src/auth/auth.service.spec.ts`
Expected: FAIL — `Nest can't resolve dependencies of AuthService (auditLogService, ?)`.

- [ ] **Step 2: Add missing providers and fix the `sign` assertion**

Replace the `TestingModule` providers and the login assertion. The full updated spec:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { Session } from '@/modules/auth/entities/session.entity';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let usersService: UsersService;
  let sessionRepo: any;
  let auditLogService: any;

  const mockJwtService = { sign: jest.fn(), verify: jest.fn() };
  const mockUsersService = {
    findOne: jest.fn(),
    create: jest.fn(),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    resetFailedLogin: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    sessionRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((x) => x),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: jest.fn().mockResolvedValue({ affected: 0 }) })) })) })),
      })),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: getRepositoryToken(Session), useValue: sessionRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  describe('login', () => {
    it('should return access token for valid credentials', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const mockUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'test@example.com', password: '$2b$10$abc',
        name: 'Test User', roleId: 'role-uuid', isActive: true,
      };
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt');

      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compareSync').mockReturnValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(result.email).toBe(loginDto.email);
      // sign is called with (payload, options) — two arguments
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: mockUser.id, email: mockUser.email, roleId: mockUser.roleId }),
        expect.objectContaining({ algorithm: 'RS256' }),
      );
    });

    it('should throw UnauthorizedException for invalid user', async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      await expect(service.login({ email: 'nope@x.com', password: 'p' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const mockUser = { id: 'u', email: 't@x.com', password: 'h', name: 'T', isActive: true };
      mockUsersService.findOne.mockResolvedValue(mockUser);
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compareSync').mockReturnValue(false);
      // recordFailedLogin path needs usersService.recordFailedLogin
      (mockUsersService as any).recordFailedLogin = jest.fn().mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null });
      await expect(service.login({ email: 't@x.com', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should create user successfully', async () => {
      const registerDto = { email: 'new@x.com', name: 'New', password: 'password123' };
      mockUsersService.findOne.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ id: 'new-uuid', ...registerDto, password: 'hashed' });
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'hashSync').mockReturnValue('hashed');

      const result = await service.register(registerDto);

      expect(result.message).toBe('User created with success');
      expect(result.userId).toBe('new-uuid');
    });

    it('should throw ConflictException for existing user', async () => {
      mockUsersService.findOne.mockResolvedValue({ id: 'uuid', email: 'e@x.com' });
      await expect(service.register({ email: 'e@x.com', name: 'E', password: 'p' })).rejects.toThrow(ConflictException);
    });
  });
});
```

- [ ] **Step 3: Run the spec to confirm it passes**

Run: `npm test -- src/auth/auth.service.spec.ts`
Expected: PASS (all 6 tests: defined; login ×3 = valid creds, invalid user, invalid password; register ×2 = create, existing user).

- [ ] **Step 4: Commit**

```bash
git add src/auth/auth.service.spec.ts
git commit -m "test: repair AuthService spec (providers + sign assertion) (B1)"
```

---

## Task 3: S1 — `tokenType` claim + cross-rejection

**Files:**
- Create: `src/auth/auth.token-type.spec.ts`
- Modify: `src/auth/auth.service.ts:213-290` (sign in `createTokensAndSession` and `rotateSession`; verify in `refresh`)
- Modify: `src/auth/strategy/jwt.strategy.ts:22` (payload type + reject non-access)

- [ ] **Step 1: Write the failing tests**

Create `src/auth/auth.token-type.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { Session } from '@/modules/auth/entities/session.entity';
import { JwtStrategy } from './strategy/jwt.strategy';
import { ConfigService } from '@nestjs/config';

describe('Token type separation (S1)', () => {
  describe('AuthService', () => {
    let service: AuthService;
    let jwt: { sign: jest.Mock; verify: jest.Mock };
    let sessionRepo: any;

    beforeEach(async () => {
      jwt = { sign: jest.fn((p: any) => `token-${p.tokenType}`), verify: jest.fn() };
      sessionRepo = {
        findOne: jest.fn(), save: jest.fn(),
        create: jest.fn((x) => x),
        createQueryBuilder: jest.fn(() => ({
          update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: jest.fn() })) })) })),
        })),
      };
      const users: any = {
        findOne: jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com', roleId: 'r', isActive: true }),
        resetFailedLogin: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: JwtService, useValue: jwt },
          { provide: UsersService, useValue: users },
          { provide: AuditLogService, useValue: { log: jest.fn() } },
          { provide: getRepositoryToken(Session), useValue: sessionRepo },
        ],
      }).compile();
      service = module.get(AuthService);
    });

    it('access token is signed with tokenType=access', async () => {
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compareSync').mockReturnValue(true);
      await service.login({ email: 't@x.com', password: 'p' });
      const accessCall = jwt.sign.mock.calls.find((c: any[]) => c[0]?.tokenType === 'access');
      expect(accessCall).toBeDefined();
    });

    it('refresh token is signed with tokenType=refresh', async () => {
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compareSync').mockReturnValue(true);
      await service.login({ email: 't@x.com', password: 'p' });
      const refreshCall = jwt.sign.mock.calls.find((c: any[]) => c[0]?.tokenType === 'refresh');
      expect(refreshCall).toBeDefined();
    });

    it('refresh rejects a token with tokenType=access (specific message, before DB lookup)', async () => {
      jwt.verify.mockReturnValue({ sub: 'u1', email: 't@x.com', tokenType: 'access' });
      // must throw BEFORE touching the session repository — proves the tokenType guard exists
      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow('Not a refresh token');
    });
  });

  describe('JwtStrategy', () => {
    it('rejects a refresh token presented as access (specific message, no user lookup)', async () => {
      const users: any = { findOne: jest.fn() };
      const cfg: any = { get: (k: string) => (k === 'keys.publicKey' ? 'pk' : undefined) };
      const strategy = new JwtStrategy(cfg, users);
      await expect(strategy.validate({ sub: 'u1', email: 't@x.com', tokenType: 'refresh' }))
        .rejects.toThrow('Wrong token type');
      // guard runs before any DB call — proves the rejection is type-based, not "user not found"
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('accepts an access token (tokenType=access) and loads user', async () => {
      const user = { id: 'u1', email: 't@x.com', isActive: true, lockedUntil: null };
      const users: any = { findOne: jest.fn().mockResolvedValue(user) };
      const cfg: any = { get: (k: string) => (k === 'keys.publicKey' ? 'pk' : undefined) };
      const strategy = new JwtStrategy(cfg, users);
      const result = await strategy.validate({ sub: 'u1', email: 't@x.com', tokenType: 'access' });
      expect(result).toEqual(user);
      expect(users.findOne).toHaveBeenCalledWith('t@x.com');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/auth/auth.token-type.spec.ts`
Expected: FAIL —
- "access token is signed with tokenType=access": no sign call has `tokenType: 'access'`.
- "refresh token is signed with tokenType=refresh": no sign call has `tokenType: 'refresh'`.
- "refresh rejects tokenType=access (specific message)": current `refresh` throws `'Invalid refresh token'` (not `'Not a refresh token'`).
- "JwtStrategy rejects refresh (specific message, no user lookup)": current `validate` throws `'Invalid token'` after calling `findOne` (assertion on message AND `findOne not called` both fail).
- "JwtStrategy accepts access token": passes today but stays green after the guard is added.

- [ ] **Step 3: Implement — add `tokenType` to tokens**

In `src/auth/auth.service.ts`, update the payload construction in both `createTokensAndSession` (~line 218) and `rotateSession` (~line 259):

```ts
const accessToken = this.jwtService.sign(
  { ...payload, tokenType: 'access' },
  { expiresIn: ACCESS_TOKEN_EXPIRES, algorithm: 'RS256' },
);
const refreshToken = this.jwtService.sign(
  { ...payload, tokenType: 'refresh' },
  { expiresIn: REFRESH_TOKEN_EXPIRES, algorithm: 'RS256' },
);
```

(Where `payload` is still `{ sub: user.id, email: user.email, roleId: user.roleId }`.)

- [ ] **Step 4: Implement — reject wrong type in `refresh`**

In `AuthService.refresh`, right after `jwtService.verify` succeeds (~line 176-179), add:

```ts
if (payload.tokenType !== 'refresh') {
  throw new UnauthorizedException('Not a refresh token');
}
```

Update the `payload` type annotation (~line 174) to include `tokenType: 'access' | 'refresh'`.

- [ ] **Step 5: Implement — reject wrong type in `JwtStrategy.validate`**

In `src/auth/strategy/jwt.strategy.ts`, update the `payload` type and add a guard at the top of `validate`:

```ts
async validate(payload: { sub: string; email: string; roleId?: string; tokenType: 'access' | 'refresh' }) {
  if (payload.tokenType !== 'access') {
    throw new UnauthorizedException('Wrong token type');
  }
  const user = await this.usersService.findOne(payload.email);
  // ... rest unchanged
}
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npm test -- src/auth/auth.token-type.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Update the repaired `auth.service.spec.ts` to assert `tokenType`**

In `src/auth/auth.service.spec.ts`, change the login `sign` assertion to also expect `tokenType`:

```ts
expect(mockJwtService.sign).toHaveBeenCalledWith(
  expect.objectContaining({ sub: mockUser.id, email: mockUser.email, roleId: mockUser.roleId, tokenType: 'access' }),
  expect.objectContaining({ algorithm: 'RS256' }),
);
```

Run: `npm test -- src/auth/auth.service.spec.ts src/auth/auth.token-type.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/auth/auth.service.ts src/auth/strategy/jwt.strategy.ts src/auth/auth.token-type.spec.ts src/auth/auth.service.spec.ts
git commit -m "feat(auth): separate access/refresh tokens via tokenType claim (S1)"
```

---

## Task 4: S2 — Require `currentPassword` on `changePassword`

**Files:**
- Create: `src/auth/auth.change-password.spec.ts`
- Modify: `src/auth/dto/change-password.dto.ts`
- Modify: `src/auth/auth.service.ts:309-330`
- Modify: `src/auth/auth.controller.ts:95-104`

- [ ] **Step 1: Write the failing tests**

Create `src/auth/auth.change-password.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { Session } from '@/modules/auth/entities/session.entity';

describe('changePassword (S2)', () => {
  let service: AuthService;
  let users: any;
  let bcryptjs: any;

  beforeEach(async () => {
    users = {
      findById: jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com', password: '$2b$10$oldhash', isActive: true }),
      findOne: jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com', password: '$2b$10$oldhash', isActive: true }),
      updatePassword: jest.fn().mockResolvedValue(undefined),
    };
    const sessionRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: jest.fn().mockResolvedValue({ affected: 1 }) })) })) })),
      })),
    };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: UsersService, useValue: users },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: getRepositoryToken(Session), useValue: sessionRepo },
      ],
    }).compile();
    service = module.get(AuthService);
    bcryptjs = await import('bcryptjs');
  });

  it('throws when currentPassword is wrong', async () => {
    jest.spyOn(bcryptjs, 'compare').mockResolvedValue(false as never);
    await expect(service.changePassword('u1', 'wrong-current', 'NewPass123!'))
      .rejects.toThrow(UnauthorizedException);
    expect(users.updatePassword).not.toHaveBeenCalled();
  });

  it('updates password and revokes sessions when currentPassword is correct', async () => {
    jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);
    jest.spyOn(bcryptjs, 'hash').mockResolvedValue('newhash' as never);
    const res = await service.changePassword('u1', 'correct-current', 'NewPass123!');
    expect(res).toEqual({ userId: 'u1' });
    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'newhash');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/auth/auth.change-password.spec.ts`
Expected: FAIL — `changePassword` currently takes `(userId, newPassword, ip, userAgent)` and does not accept/verify `currentPassword`; `compare`/`hash` async not used.

- [ ] **Step 3: Update `ChangePasswordDto`**

`src/auth/dto/change-password.dto.ts`:

```ts
import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldSecureP@ss1', description: 'Current password (re-authentication)' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ minLength: 8, example: 'NewSecureP@ss123', description: 'New password (min 8 characters)' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}
```

- [ ] **Step 4: Rewrite `AuthService.changePassword`**

In `src/auth/auth.service.ts`, replace `changePassword` (~line 309) with:

```ts
async changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ip?: string,
  userAgent?: string,
): Promise<{ userId: string }> {
  const user = await this.usersService.findById(userId);
  if (!user) {
    throw new UnauthorizedException('User not found');
  }

  const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentValid) {
    throw new UnauthorizedException('Current password is incorrect');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await this.usersService.updatePassword(userId, hashedPassword);

  const result = await this.sessionRepository
    .createQueryBuilder()
    .update(Session)
    .set({ revokedAt: () => 'NOW()' })
    .where('user_id = :userId AND revoked_at IS NULL', { userId })
    .execute();

  this.logger.log(`Password changed for user ${userId}. Revoked ${result.affected ?? 0} active sessions.`);

  await this.auditLogService.log({
    action: 'auth.password_change',
    entityType: 'User',
    entityId: userId,
    actorUserId: userId,
    metadata: { revokedSessionCount: result.affected ?? 0 },
    ip: ip ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return { userId };
}
```

Also update the import at the top of `auth.service.ts`. Keep `compareSync` (still used by `login`) and `hashSync` (still used by `register` at ~line 298); add the async `compare` and `hash`:

```ts
import { compareSync, hashSync, compare, hash } from 'bcryptjs';
```

- [ ] **Step 5: Update the controller to pass `currentPassword`**

In `src/auth/auth.controller.ts`, change `changePassword` (~line 95-104):

```ts
async changePassword(
  @Body() dto: ChangePasswordDto,
  @Req() req: Request & { user?: { id: string } },
) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedException('User not authenticated');
  const ip = req.ip ?? req.socket?.remoteAddress;
  const userAgent = req.get('user-agent');
  return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword, ip, userAgent);
}
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npm test -- src/auth/auth.change-password.spec.ts`
Expected: PASS (2 tests).

Note: `login` still uses `compareSync` and `register` still uses `hashSync`. Those are intentionally left synchronous in this task (P1 will migrate `login` to async). The import keeps all four: `import { compareSync, hashSync, compare, hash } from 'bcryptjs';`

- [ ] **Step 7: Run the full auth test suite**

Run: `npm test -- src/auth`
Expected: PASS (all auth specs).

- [ ] **Step 8: Commit**

```bash
git add src/auth/dto/change-password.dto.ts src/auth/auth.service.ts src/auth/auth.controller.ts src/auth/auth.change-password.spec.ts
git commit -m "feat(auth): require currentPassword on changePassword (S2)"
```

---

## Task 5: S3 — Global Keyv cache (Redis with memory fallback)

**Files:**
- Create: `src/config/cache-stores.factory.ts`
- Create: `src/config/cache-stores.factory.spec.ts`
- Modify: `src/app.module.ts`
- Modify: `src/modules/rbac/rbac.module.ts:27-31`
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Install Keyv packages**

Run:
```bash
npm i @keyv/redis keyv cacheable
```
Expected: packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing tests for the factory**

Create `src/config/cache-stores.factory.spec.ts`:

```ts
import { buildCacheStores, buildCacheStoresOptions } from './cache-stores.factory';

describe('buildCacheStores (S3)', () => {
  it('returns a memory store when REDIS_HOST is not set', () => {
    const cfg: any = { get: (k: string) => undefined };
    const stores = buildCacheStores(cfg);
    expect(stores.length).toBe(1);
    expect(stores[0]).toBeDefined();
    expect(typeof stores[0].get).toBe('function');
  });

  it('returns a KeyvRedis-backed store when REDIS_HOST is set (no eager connect)', () => {
    const cfg: any = { get: (k: string) => (k === 'REDIS_HOST' ? 'redis' : 6379) };
    const stores = buildCacheStores(cfg);
    expect(stores.length).toBe(1);
    // KeyvRedis instance is identifiable by its namespace/store name without forcing a connection
    expect(stores[0]).toBeDefined();
    expect(typeof stores[0].get).toBe('function');
    // sanity: a real Redis URL was captured (avoid relying on an actual socket connection in unit tests)
    expect((stores[0] as any).namespace ?? 'redis').toBeTruthy();
  });

  it('respects RBAC_CACHE_TTL when provided', () => {
    const cfg: any = { get: (k: string) => (k === 'RBAC_CACHE_TTL' ? 60000 : undefined) };
    const { ttl } = buildCacheStoresOptions(cfg);
    expect(ttl).toBe(60000);
  });

  it('defaults RBAC_CACHE_TTL to 300000 when not provided', () => {
    const cfg: any = { get: () => undefined };
    const { ttl } = buildCacheStoresOptions(cfg);
    expect(ttl).toBe(300_000);
  });
});
```

(Note: `buildCacheStoresOptions` is exported alongside `buildCacheStores` so the `CacheModule` factory and the test both use the same config shape.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/config/cache-stores.factory.spec.ts`
Expected: FAIL — module `./cache-stores.factory` does not exist.

- [ ] **Step 4: Implement the factory**

Create `src/config/cache-stores.factory.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

export interface CacheOptions {
  ttl: number;
  stores: Keyv[];
}

export function buildCacheStores(configService: ConfigService): Keyv[] {
  const host = configService.get<string>('REDIS_HOST');
  const port = configService.get<number>('REDIS_PORT') ?? 6379;

  if (host) {
    return [new KeyvRedis({ socket: { host, port } })];
  }
  // Dev/test fallback: in-memory store (no Redis required)
  return [new Keyv({ store: new KeyvCacheableMemory() })];
}

export function buildCacheStoresOptions(configService: ConfigService): CacheOptions {
  return {
    ttl: configService.get<number>('RBAC_CACHE_TTL', 300_000),
    stores: buildCacheStores(configService),
  };
}
```

- [ ] **Step 5: Run the factory tests to verify they pass**

Run: `npm test -- src/config/cache-stores.factory.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire the global `CacheModule` into `AppModule`**

In `src/app.module.ts`, add imports and register the module. Add to the `imports` array (before `RbacModule`):

```ts
import { CacheModule } from '@nestjs/cache-manager';
import { buildCacheStoresOptions } from './config/cache-stores.factory';
// ...

    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => buildCacheStoresOptions(cfg),
    }),
    RbacModule,
```

- [ ] **Step 7: Remove the local `CacheModule` from `RbacModule`**

In `src/modules/rbac/rbac.module.ts`, remove the `CacheModule` import and the `CacheModule.register({ ttl: 300000, max: 1000 })` block from `imports` (~line 27-31). Keep `TypeOrmModule.forFeature([...])`. The global `CacheModule` now provides `CACHE_MANAGER` to `RbacService`.

- [ ] **Step 8: Verify `RbacService` still works with the existing spec**

Run: `npm test -- src/modules/rbac/services/rbac.service.spec.ts`
Expected: PASS (the spec provides its own `CACHE_MANAGER` mock, so it is unaffected by the module change).

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS (all specs). If a spec fails because it bootstraps `AppModule` (e.g. e2e), that is a known separate issue (B20) — out of P0 scope; do not fix here, but record it.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/config/cache-stores.factory.ts src/config/cache-stores.factory.spec.ts src/app.module.ts src/modules/rbac/rbac.module.ts
git commit -m "feat(cache): global Keyv cache (Redis + memory fallback) for RBAC (S3)"
```

---

## Task 6: I1 — Repair the Dockerfile (npm-based)

**Files:**
- Modify: `Dockerfile`

**Verification gate:** `docker build` must succeed. There is no `yarn.lock` in the repo (confirmed), so the current `COPY --from=builder /app/yarn.lock` fails the build.

- [ ] **Step 1: Confirm the current build fails**

Run:
```bash
docker build -t prime-nest-p0-test . --target production
```
Expected: FAIL — `COPY failed: file not found in build stage: app/yarn.lock` (or `yarn install --frozen-lockfile` fails).

- [ ] **Step 2: Rewrite the Dockerfile to use npm**

Replace `Dockerfile` entirely:

```dockerfile
# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY scripts/docker-entrypoint.sh /app/scripts/docker-entrypoint.sh
RUN chmod +x /app/scripts/docker-entrypoint.sh && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
  CMD wget -qO- http://127.0.0.1:3000/health/readiness || exit 1

CMD ["sh", "scripts/docker-entrypoint.sh"]
```

- [ ] **Step 3: Confirm the build now succeeds**

Run:
```bash
docker build -t prime-nest-p0-test . --target production
```
Expected: PASS — image built successfully.

- [ ] **Step 4: (Optional smoke) Run the image with the compose dependencies**

```bash
docker compose up -d postgres redis
docker run --rm --network="$(docker compose ps -q postgres | xargs docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')" -e DB_HOST=postgres -e DB_PORT=5432 -e DB_USERNAME=postgres -e DB_PASSWORD=postgres -e DB_DATABASE=admin_limify -e REDIS_HOST=redis -e REDIS_PORT=6379 -e PRIVATE_KEY= -e PUBLIC_KEY= prime-nest-p0-test echo "built ok"
```
Expected: container starts (it will fail to boot without real keys — that is expected and not in scope; the goal is to confirm the image runs).

- [ ] **Step 5: Commit**

```bash
git add Dockerfile
git commit -m "fix(docker): rewrite Dockerfile to npm ci (no yarn.lock present) (I1)"
```

---

## Final verification

- [ ] **Run the full unit suite**

```bash
npm test
```
Expected: PASS (all specs green; `auth.service.spec`, `app.controller.spec`, new `auth.token-type.spec`, `auth.change-password.spec`, `cache-stores.factory.spec`, and existing `rbac.service.spec` all pass).

- [ ] **Run lint on touched files**

```bash
npx eslint src/auth src/config src/app.module.ts src/modules/rbac/rbac.module.ts --fix
```
Expected: no errors on touched files. (Note: pre-existing lint issues elsewhere — `migrations/seeds/rbac.seed.ts` `no-console`, Windows linebreaks — are I4, out of P0 scope.)

- [ ] **Confirm Docker build**

```bash
docker build -t prime-nest-p0-test . --target production
```
Expected: PASS.

- [ ] **Final commit (if any lint fixes)**

```bash
git add -A
git commit -m "chore: lint after P0 fixes" --allow-empty
```

---

## Out-of-scope reminders (do NOT do in this plan)

- **S4** lockout check in `refresh` — P1.
- **S6/D2** `@nestjs/throttler` migration — P1.
- **S9/F2** logout endpoint — P1.
- **S10/F5** global guard + `@Public()` — P1.
- **S11** atomic refresh rotation — P1.
- **B2** TypeORM query cache config — P1.
- **B3** register role assignment — P1.
- **P1** bcrypt async in `login` — P1 (this plan only async-ifies `changePassword`).
- **I2/I3/I4** setup.sh, CI, lint config — separate plans.
- **C1–C4** audit compliance — separate plan.

---

## Notes for the executor

- **TDD ordering rationale:** Tasks 1–2 establish a green baseline (repair pre-existing broken specs) BEFORE TDD-ing new behavior (Tasks 3–4), so each subsequent "run test to see it fail" is meaningful and not masked by pre-existing breakage.
- **`compareSync` in `login`:** Left synchronous intentionally in this plan; migrating `login` to async bcrypt is P1 (item P1 in the analysis). Do not change `login` here.
- **Cache factory testability:** The Keyv stores are created behind `buildCacheStores` so the test can exercise both branches (memory fallback vs Redis) without a live Redis — this is what makes S3 TDD-able.
- **`auth.service.spec.ts` is touched twice** (Task 2 repair to current contract, Task 3 add `tokenType` assertion). This is intentional and each commit is green.
