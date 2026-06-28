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
        email: 'test@example.com',
        password: '$2b$10$abc',
        name: 'Test User',
        roleId: 'role-uuid',
        isActive: true,
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
        expect.objectContaining({
          sub: mockUser.id,
          email: mockUser.email,
          roleId: mockUser.roleId,
        }),
        expect.objectContaining({ algorithm: 'RS256' }),
      );
    });

    it('should throw UnauthorizedException for invalid user', async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@x.com', password: 'p' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      // login checks isActive before compareSync/lockedUntil, so no bcrypt mock needed
      mockUsersService.findOne.mockResolvedValue({
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
      mockUsersService.findOne.mockResolvedValue(mockUser);
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compareSync').mockReturnValue(false);
      // recordFailedLogin path needs usersService.recordFailedLogin
      (mockUsersService as any).recordFailedLogin = jest
        .fn()
        .mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null });
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
      });
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'hashSync').mockReturnValue('hashed');

      const result = await service.register(registerDto);

      expect(result.message).toBe('User created with success');
      expect(result.userId).toBe('new-uuid');
      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: registerDto.email,
        name: registerDto.name,
        password: 'hashed',
      });
    });

    it('should throw ConflictException for existing user', async () => {
      mockUsersService.findOne.mockResolvedValue({ id: 'uuid', email: 'e@x.com' });
      await expect(
        service.register({ email: 'e@x.com', name: 'E', password: 'p' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
