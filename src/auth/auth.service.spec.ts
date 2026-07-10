import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { Session } from '@/modules/auth/entities/session.entity';
import { Role } from '@/modules/rbac/entities/role.entity';
import { User } from '@/modules/rbac/entities/user.entity';
import { INVALID_CREDENTIALS_MESSAGE } from './auth.constants';

describe('AuthService', () => {
  let service: AuthService;
  let sessionRepo: any;
  let auditLogService: any;

  const mockJwtService = { sign: jest.fn(), verify: jest.fn() };
  const mockUsersService = {
    findOne: jest.fn(),
    findOneWithPassword: jest.fn(),
    findById: jest.fn(),
    findByIdWithPassword: jest.fn(),
    create: jest.fn(),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    resetFailedLogin: jest.fn().mockResolvedValue(undefined),
    recordFailedLogin: jest.fn(),
  };

  beforeEach(async () => {
    sessionRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((x) => x),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              execute: jest.fn().mockResolvedValue({ affected: 0 }),
            })),
          })),
        })),
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
        { provide: getRepositoryToken(Role), useValue: { findOne: jest.fn().mockResolvedValue({ id: 'viewer-role-uuid' }) } },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(service).toBeDefined());

  describe('login', () => {
    it('should return access token for valid credentials', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const mockUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'test@example.com',
        password: '$2b$10$abc',
        name: 'Test User',
        roleId: 'role-uuid',
        isActive: true,
      };
      mockUsersService.findOneWithPassword.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt');

      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(result.email).toBe(loginDto.email);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          email: mockUser.email,
          roleId: mockUser.roleId,
          tokenType: 'access',
        }),
        expect.objectContaining({ algorithm: 'RS256' }),
      );
    });

    it('audits auth.login_success on successful login with ip and userAgent', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const mockUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'test@example.com',
        password: '$2b$10$abc',
        name: 'Test User',
        roleId: 'role-uuid',
        isActive: true,
        lockedUntil: null,
      };
      mockUsersService.findOneWithPassword.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-jwt');
      sessionRepo.save.mockResolvedValue(undefined);
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);

      await service.login(loginDto, '1.2.3.4', 'UA-test');

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login_success',
          entityType: 'User',
          entityId: mockUser.id,
          actorUserId: mockUser.id,
          ip: '1.2.3.4',
          userAgent: 'UA-test',
        }),
      );
    });

    it('should throw UnauthorizedException for invalid user', async () => {
      mockUsersService.findOneWithPassword.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@x.com', password: 'p' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns generic message for inactive user (no enumeration)', async () => {
      mockUsersService.findOneWithPassword.mockResolvedValue({
        id: 'uuid',
        email: 't@x.com',
        password: 'h',
        name: 'T',
        isActive: false,
      });
      await expect(service.login({ email: 't@x.com', password: 'p' })).rejects.toThrow(
        new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE),
      );
    });

    it('returns generic message when account is locked (no timestamp in response)', async () => {
      const future = new Date(Date.now() + 60_000);
      mockUsersService.findOneWithPassword.mockResolvedValue({
        id: 'u',
        email: 't@x.com',
        password: 'h',
        name: 'T',
        isActive: true,
        lockedUntil: future,
      });
      await expect(service.login({ email: 't@x.com', password: 'p' })).rejects.toThrow(
        new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE),
      );
    });

    it('returns generic message when wrong password triggers lockout', async () => {
      const future = new Date(Date.now() + 60_000);
      mockUsersService.findOneWithPassword.mockResolvedValue({
        id: 'u',
        email: 't@x.com',
        password: 'h',
        name: 'T',
        isActive: true,
        lockedUntil: null,
      });
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(false as never);
      mockUsersService.recordFailedLogin.mockResolvedValue({
        failedLoginAttempts: 5,
        lockedUntil: future,
      });
      await expect(service.login({ email: 't@x.com', password: 'wrong' })).rejects.toThrow(
        new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.account.locked' }),
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const mockUser = {
        id: 'u',
        email: 't@x.com',
        password: 'h',
        name: 'T',
        isActive: true,
      };
      mockUsersService.findOneWithPassword.mockResolvedValue(mockUser);
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(false as never);
      mockUsersService.recordFailedLogin.mockResolvedValue({
        failedLoginAttempts: 1,
        lockedUntil: null,
      });
      await expect(
        service.login({ email: 't@x.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should create user successfully', async () => {
      const registerDto = {
        email: 'new@x.com',
        name: 'New',
        password: 'password123',
      };
      mockUsersService.findOne.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'new-uuid',
        ...registerDto,
        password: 'hashed',
        roleId: 'viewer-role-uuid',
      });
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'hash').mockResolvedValue('hashed' as never);

      const result = await service.register(registerDto);

      expect(result.message).toBe('User created with success');
      expect(result.userId).toBe('new-uuid');
      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: registerDto.email,
        name: registerDto.name,
        password: 'hashed',
        roleId: 'viewer-role-uuid',
      });
    });

    it('should throw ConflictException for existing user', async () => {
      mockUsersService.findOne.mockResolvedValue({ id: 'uuid', email: 'e@x.com' });
      await expect(
        service.register({ email: 'e@x.com', name: 'E', password: 'p' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when email belongs to a soft-deleted user (unique violation)', async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      mockUsersService.create.mockRejectedValue(new ConflictException('User already exists'));

      await expect(
        service.register({ email: 'reuse@x.com', name: 'Reuse', password: 'Passw0rd123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows non-23505 errors from create unchanged (not ConflictException)', async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      const foreignError = Object.assign(new Error('fk violation'), { code: '23503' });
      mockUsersService.create.mockRejectedValue(foreignError);

      await expect(
        service.register({ email: 'fk@x.com', name: 'FK', password: 'Passw0rd123' }),
      ).rejects.toThrow('fk violation');
    });
  });

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
      const lockedExecute = jest.fn().mockResolvedValue({ affected: 1 });
      const lockedQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: lockedExecute,
      };
      const emFindOne = jest.fn()
        .mockResolvedValueOnce({
          id: 's1', userId: 'u1', refreshTokenHash: 'hash', revokedAt: null,
          expiresAt: new Date(Date.now() + 60000),
        })
        .mockResolvedValueOnce(lockedUser); // User loaded with withDeleted
      const txMock = jest.fn(async (cb: any) => cb({
        findOne: emFindOne,
        save: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_: any, d: any) => d),
        getRepository: () => ({
          find: jest.fn().mockResolvedValue([{ accessJti: 'a1' }]),
          createQueryBuilder: () => lockedQb,
        }),
      }));
      (sessionRepo as any).manager = { transaction: txMock };
      (service as any).cacheManager = {
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow(
        INVALID_CREDENTIALS_MESSAGE,
      );
      expect(lockedExecute).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.refresh_denied_invalid_user' }),
      );
    });

    it('rotates the session inside a transaction with a pessimistic_write lock', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'u1', email: 't@x.com', tokenType: 'refresh', jti: 'rjti', exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const sessionOnly = {
        id: 's1', userId: 'u1', refreshTokenHash: 'hash', revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      };
      const user = { id: 'u1', email: 't@x.com', roleId: 'r', isActive: true, lockedUntil: null };
      const emFindOne = jest.fn()
        .mockResolvedValueOnce(sessionOnly)
        .mockResolvedValueOnce(user);
      const emSave = jest.fn().mockResolvedValue(undefined);
      const revokeExecute = jest.fn().mockResolvedValue(undefined);
      const emQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: revokeExecute,
      };
      const emCreate = jest.fn((_target: any, data: any) => ({ id: 's2', ...data }));
      const txMock = jest.fn(async (cb: any) => cb({
        findOne: emFindOne,
        createQueryBuilder: jest.fn().mockReturnValue(emQb),
        save: emSave,
        create: emCreate,
        getRepository: () => ({ create: emCreate, save: emSave }),
      }));
      (sessionRepo as any).manager = { transaction: txMock };
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      mockJwtService.sign.mockReturnValue('tok');

      await service.refresh({ refresh_token: 't' });

      expect(txMock).toHaveBeenCalled();
      expect(emFindOne).toHaveBeenNthCalledWith(1, Session,
        expect.objectContaining({ where: { refreshTokenHash: 'hash' }, lock: { mode: 'pessimistic_write' } }),
      );
      expect(emFindOne).toHaveBeenNthCalledWith(2, User,
        expect.objectContaining({ where: { id: 'u1' }, withDeleted: true }),
      );
      expect(revokeExecute).toHaveBeenCalledTimes(1);
      expect(emSave).toHaveBeenCalledTimes(1);
      expect(emQb.set).toHaveBeenCalledWith(
        expect.objectContaining({ rotatedToSessionId: 's2' }),
      );
    });

    it('on revoked-session reuse: bulk-revokes active sessions, logs audit with null actor + suspectedReuse, and throws', async () => {
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
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
          rotatedToSessionId: null,
          expiresAt: new Date(Date.now() + 60000),
          user: { id: 'u1', email: 'u@x.com', isActive: true, lockedUntil: null },
        }),
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: () => qb,
          find: jest.fn().mockResolvedValue([{ accessJti: 'a1' }, { accessJti: 'a2' }]),
        }),
        save: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockReturnValue({ id: 's2' }),
      };
      (service as any).cacheManager = {
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(undefined),
      };
      const txMock = jest.fn(async (cb: any) => cb(em));
      (sessionRepo as any).manager = { transaction: txMock };

      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow(UnauthorizedException);

      expect(updateExecute).toHaveBeenCalled();
      expect(qb.where).toHaveBeenCalledWith('user_id = :userId AND revoked_at IS NULL', { userId: 'u1' });
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.refresh_token_reuse_detected',
          actorUserId: null,
          metadata: expect.objectContaining({ suspectedReuse: true, revokedSessionCount: 2 }),
        }),
      );
    });

    it('on already-rotated session: throws without bulk-revoking (no false-positive reuse)', async () => {
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      mockJwtService.verify.mockReturnValue({
        sub: 'u1', email: 't@x.com', tokenType: 'refresh', exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const reusedExecute = jest.fn().mockResolvedValue({ affected: 99 }); // must NOT be called
      const qb: any = {
        update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(), execute: reusedExecute,
      };
      const em: any = {
        findOne: jest.fn().mockResolvedValue({
          id: 's1', userId: 'u1', refreshTokenHash: 'hash',
          revokedAt: new Date(), rotatedToSessionId: 's2',
          expiresAt: new Date(Date.now() + 60000),
        }),
        getRepository: jest.fn().mockReturnValue({ createQueryBuilder: () => qb, find: jest.fn().mockResolvedValue([]) }),
        save: jest.fn(), create: jest.fn(),
      };
      (sessionRepo as any).manager = { transaction: jest.fn(async (cb: any) => cb(em)) };

      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow(UnauthorizedException);
      expect(reusedExecute).not.toHaveBeenCalled();
      expect(auditLogService.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.refresh_token_reuse_detected' }),
      );
    });

    it('audits auth.session.context_mismatch when refresh IP/UA differs from session', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'u1',
        email: 't@x.com',
        tokenType: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const sessionSemUser = {
        id: 's1',
        userId: 'u1',
        refreshTokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        ip: '1.1.1.1',
        userAgent: 'OldAgent',
      };
      const user = { id: 'u1', email: 't@x.com', roleId: 'r', isActive: true, lockedUntil: null };
      const emFindOne = jest.fn()
        .mockResolvedValueOnce(sessionSemUser)
        .mockResolvedValueOnce(user);
      const emSave = jest.fn().mockResolvedValue(undefined);
      const revokeExecute = jest.fn().mockResolvedValue(undefined);
      const emQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: revokeExecute,
      };
      const emCreate = jest.fn((_target: any, data: any) => data);
      const txMock = jest.fn(async (cb: any) =>
        cb({
          findOne: emFindOne,
          createQueryBuilder: jest.fn().mockReturnValue(emQb),
          save: emSave,
          create: emCreate,
        }),
      );
      (sessionRepo as any).manager = { transaction: txMock };
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      mockJwtService.sign.mockReturnValue('tok');

      await service.refresh({ refresh_token: 't' }, '9.9.9.9', 'NewAgent');

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.session.context_mismatch',
          entityId: 's1',
          metadata: expect.objectContaining({
            sessionIp: '1.1.1.1',
            requestIp: '9.9.9.9',
          }),
        }),
      );
    });

    it('rejects a soft-deleted user with 401 and revokes all sessions (no 500, no token issuance)', async () => {
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      mockJwtService.verify.mockReturnValue({
        sub: 'u1', email: 't@x.com', tokenType: 'refresh', exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const bulkExecute = jest.fn().mockResolvedValue({ affected: 1 });
      const qb: any = {
        update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(), execute: bulkExecute,
      };
      const em: any = {
        findOne: jest.fn()
          .mockResolvedValueOnce({ // session
            id: 's1', userId: 'u1', refreshTokenHash: 'hash', revokedAt: null,
            expiresAt: new Date(Date.now() + 60000),
          })
          .mockResolvedValueOnce({ // user with withDeleted
            id: 'u1', email: 't@x.com', isActive: true, deletedAt: new Date(), lockedUntil: null,
          }),
        getRepository: jest.fn().mockReturnValue({ createQueryBuilder: () => qb, find: jest.fn().mockResolvedValue([]) }),
        save: jest.fn(), create: jest.fn(),
      };
      (service as any).cacheManager = { set: jest.fn(), get: jest.fn().mockResolvedValue(undefined) };
      (sessionRepo as any).manager = { transaction: jest.fn(async (cb: any) => cb(em)) };

      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow(UnauthorizedException);
      expect(em.findOne).toHaveBeenNthCalledWith(2, User, expect.objectContaining({ withDeleted: true }));
      expect(bulkExecute).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.refresh_denied_invalid_user' }),
      );
    });

    it('rejects an inactive user with 401 and revokes all sessions', async () => {
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      mockJwtService.verify.mockReturnValue({
        sub: 'u1', email: 't@x.com', tokenType: 'refresh', exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const bulkExecute = jest.fn().mockResolvedValue({ affected: 1 });
      const qb: any = {
        update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(), execute: bulkExecute,
      };
      const em: any = {
        findOne: jest.fn()
          .mockResolvedValueOnce({ id: 's1', userId: 'u1', refreshTokenHash: 'hash', revokedAt: null, expiresAt: new Date(Date.now() + 60000) })
          .mockResolvedValueOnce({ id: 'u1', email: 't@x.com', isActive: false, deletedAt: null, lockedUntil: null }),
        getRepository: jest.fn().mockReturnValue({ createQueryBuilder: () => qb, find: jest.fn().mockResolvedValue([]) }),
        save: jest.fn(), create: jest.fn(),
      };
      (service as any).cacheManager = { set: jest.fn(), get: jest.fn().mockResolvedValue(undefined) };
      (sessionRepo as any).manager = { transaction: jest.fn(async (cb: any) => cb(em)) };

      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow(UnauthorizedException);
      expect(em.findOne).toHaveBeenNthCalledWith(2, User, expect.objectContaining({ withDeleted: true }));
      expect(bulkExecute).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.refresh_denied_invalid_user' }),
      );
    });
  });

  describe('logout', () => {
    it('denylists the access jti and revokes the matching session', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      const executeMock = jest.fn().mockResolvedValue({ affected: 1 });
      (service as any).cacheManager = { set: setSpy, get: jest.fn().mockResolvedValue(undefined) };
      sessionRepo.createQueryBuilder = jest.fn(() => ({
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({ execute: executeMock })),
          })),
        })),
      })) as any;

      await service.logout('u1', 'access-jti-1', 'refresh-token-1');

      expect(setSpy).toHaveBeenCalledWith('jti:access-jti-1', expect.anything(), expect.any(Number));
      expect(executeMock).toHaveBeenCalled();
    });

    it('logoutAll revokes every active session of the user and denylists the jti', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      const executeMock = jest.fn().mockResolvedValue({ affected: 3 });
      (service as any).cacheManager = { set: setSpy };
      sessionRepo.find = jest.fn().mockResolvedValue([]) as any;
      sessionRepo.createQueryBuilder = jest.fn(() => ({
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: executeMock })) })) })),
      })) as any;

      await service.logoutAll('u1', 'access-jti-1');

      expect(setSpy).toHaveBeenCalledWith('jti:access-jti-1', expect.anything(), expect.any(Number));
      expect(executeMock).toHaveBeenCalled();
    });

    it('does not revoke a session that belongs to a different user', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      const executeMock = jest.fn().mockResolvedValue({ affected: 0 });
      (service as any).cacheManager = { set: setSpy, get: jest.fn().mockResolvedValue(undefined) };
      sessionRepo.createQueryBuilder = jest.fn(() => ({
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({ execute: executeMock })),
          })),
        })),
      })) as any;

      await service.logout('u1', 'access-jti-1', 'refresh-token-1');

      expect(setSpy).toHaveBeenCalledWith('jti:access-jti-1', expect.anything(), expect.any(Number));
      expect(executeMock).toHaveBeenCalled();
    });

    it('does not write a jti:undefined key when accessJti is missing (rolling-deploy safety)', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      const executeMock = jest.fn().mockResolvedValue({ affected: 1 });
      (service as any).cacheManager = { set: setSpy, get: jest.fn().mockResolvedValue(undefined) };
      sessionRepo.createQueryBuilder = jest.fn(() => ({
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({ execute: executeMock })),
          })),
        })),
      })) as any;

      await service.logout('u1', undefined as unknown as string, 'refresh-token-1');

      expect(setSpy).not.toHaveBeenCalled();
      expect(executeMock).toHaveBeenCalled();
    });
  });

  describe('changePassword / logoutAll denylist', () => {
    it('changePassword denylists every active access JTI of the user, not just the current one', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      (service as any).cacheManager = { set: setSpy, get: jest.fn().mockResolvedValue(undefined) };
      // revokeAllUserSessions does find() on active sessions before the update
      sessionRepo.find = jest.fn().mockResolvedValue([
        { accessJti: 'a1' }, { accessJti: 'a2' }, { accessJti: null },
      ]) as any;
      const executeMock = jest.fn().mockResolvedValue({ affected: 2 });
      sessionRepo.createQueryBuilder = jest.fn(() => ({
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: executeMock })) })) })),
      })) as any;
      mockUsersService.findByIdWithPassword.mockResolvedValue({
        id: 'u1', email: 't@x.com', password: 'h', isActive: true,
      });
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);
      jest.spyOn(bcryptjs, 'hash').mockResolvedValue('newhash' as never);

      await service.changePassword('u1', 'old', 'NewP@ssw0rd1234');

      expect(setSpy).toHaveBeenCalledWith('jti:a1', 1, expect.any(Number));
      expect(setSpy).toHaveBeenCalledWith('jti:a2', 1, expect.any(Number));
    });

    it('logoutAll denylists all active access JTIs of the user (not only the caller JTI)', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      (service as any).cacheManager = { set: setSpy };
      sessionRepo.find = jest.fn().mockResolvedValue([{ accessJti: 'other-jti' }]) as any;
      const executeMock = jest.fn().mockResolvedValue({ affected: 1 });
      sessionRepo.createQueryBuilder = jest.fn(() => ({
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: executeMock })) })) })),
      })) as any;

      await service.logoutAll('u1', 'current-jti');

      expect(setSpy).toHaveBeenCalledWith('jti:current-jti', 1, expect.any(Number));
      expect(setSpy).toHaveBeenCalledWith('jti:other-jti', 1, expect.any(Number));
    });
  });

  describe('token pair', () => {
    it('createTokensAndSession persists the accessJti on the new session', async () => {
      mockUsersService.findOneWithPassword.mockResolvedValue({
        id: 'u1', email: 't@x.com', password: 'h', name: 'T',
        roleId: 'r', isActive: true, lockedUntil: null,
      });
      mockUsersService.resetFailedLogin.mockResolvedValue(undefined);
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);
      mockJwtService.sign.mockReturnValue('tok');
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      const captured: any[] = [];
      sessionRepo.create = jest.fn((data: any) => data) as any;
      sessionRepo.save = jest.fn(async (s: any) => { captured.push(s); return s; });

      await service.login(
        { email: 't@x.com', password: 'p' },
        '1.1.1.1', 'UA',
      );

      expect(captured[0].accessJti).toEqual(expect.any(String));
      expect(captured[0].jti).toEqual(expect.any(String)); // refresh jti
      expect(captured[0].accessJti).not.toBe(captured[0].jti);
    });
  });

  describe('listSessions', () => {
    it('returns only active non-revoked non-expired sessions', async () => {
      const now = Date.now();
      sessionRepo.find = jest.fn().mockResolvedValue([
        {
          id: 's1',
          ip: '1.2.3.4',
          userAgent: 'UA',
          createdAt: new Date(now - 1000),
          expiresAt: new Date(now + 60000),
          revokedAt: null,
        },
      ]);

      const result = await service.listSessions('u1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({ id: 's1', ip: '1.2.3.4', userAgent: 'UA' }),
      );
      expect(sessionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            revokedAt: expect.anything(),
            expiresAt: expect.anything(),
          }),
        }),
      );
    });
  });
});
