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

    it('should throw UnauthorizedException for invalid user', async () => {
      mockUsersService.findOneWithPassword.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@x.com', password: 'p' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      mockUsersService.findOneWithPassword.mockResolvedValue({
        id: 'uuid',
        email: 'test@example.com',
        password: 'hashedpassword',
        name: 'Test User',
        isActive: false,
      });
      await expect(
        service.login({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
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
      mockUsersService.create.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

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
      const emFindOne = jest.fn().mockResolvedValue({
        id: 's1',
        userId: 'u1',
        refreshTokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        user: lockedUser,
      });
      const txMock = jest.fn(async (cb: any) => cb({
        findOne: emFindOne,
        save: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_: any, d: any) => d),
      }));
      (sessionRepo as any).manager = { transaction: txMock };
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      jest.spyOn(service as any, 'constantTimeCompare').mockReturnValue(true);
      await expect(service.refresh({ refresh_token: 't' })).rejects.toThrow(
        'Account locked due to too many failed attempts',
      );
    });

    it('rotates the session inside a transaction with a pessimistic_write lock', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'u1', email: 't@x.com', tokenType: 'refresh', jti: 'rjti', exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const lockedSession = {
        id: 's1', userId: 'u1', refreshTokenHash: 'hash', revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 'u1', email: 't@x.com', roleId: 'r', isActive: true, lockedUntil: null },
      };
      const emFindOne = jest.fn().mockResolvedValue(lockedSession);
      const emSave = jest.fn().mockResolvedValue(undefined);
      const emCreate = jest.fn((_target: any, data: any) => data);
      const txMock = jest.fn(async (cb: any) => cb({
        findOne: emFindOne,
        save: emSave,
        create: emCreate,
        getRepository: () => ({ create: emCreate, save: emSave }),
      }));
      (sessionRepo as any).manager = { transaction: txMock };
      jest.spyOn(service as any, 'hashRefreshToken').mockReturnValue('hash');
      jest.spyOn(service as any, 'constantTimeCompare').mockReturnValue(true);
      mockJwtService.sign.mockReturnValue('tok');

      await service.refresh({ refresh_token: 't' });

      expect(txMock).toHaveBeenCalled();
      expect(emFindOne).toHaveBeenCalledWith(
        Session,
        expect.objectContaining({ where: { refreshTokenHash: 'hash' }, lock: { mode: 'pessimistic_write' } }),
      );
      expect(emSave).toHaveBeenCalledTimes(2);
    });
  });

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

    it('does not revoke a session that belongs to a different user', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      (service as any).cacheManager = { set: setSpy, get: jest.fn().mockResolvedValue(undefined) };
      sessionRepo.findOne.mockResolvedValue({ id: 's1', userId: 'other-user', refreshTokenHash: 'h', revokedAt: null });
      sessionRepo.save = jest.fn().mockResolvedValue(undefined);

      await service.logout('u1', 'access-jti-1', 'refresh-token-1');

      expect(setSpy).toHaveBeenCalledWith('jti:access-jti-1', expect.anything(), expect.any(Number));
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });

    it('does not write a jti:undefined key when accessJti is missing (rolling-deploy safety)', async () => {
      const setSpy = jest.fn().mockResolvedValue(undefined);
      (service as any).cacheManager = { set: setSpy, get: jest.fn().mockResolvedValue(undefined) };
      sessionRepo.findOne.mockResolvedValue({ id: 's1', userId: 'u1', refreshTokenHash: 'h', revokedAt: null });
      sessionRepo.save = jest.fn().mockResolvedValue(undefined);

      await service.logout('u1', undefined as unknown as string, 'refresh-token-1');

      expect(setSpy).not.toHaveBeenCalled();
      expect(sessionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', revokedAt: expect.any(Date) }));
    });
  });
});
