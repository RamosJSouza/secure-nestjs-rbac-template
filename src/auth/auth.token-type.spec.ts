import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { Session } from '@/modules/auth/entities/session.entity';
import { Role } from '@/modules/rbac/entities/role.entity';
import { JwtStrategy } from './strategy/jwt.strategy';

describe('Token type separation (S1)', () => {
  describe('AuthService', () => {
    let service: AuthService;
    let jwt: { sign: jest.Mock; verify: jest.Mock };
    let sessionRepo: any;

    beforeEach(async () => {
      jwt = { sign: jest.fn((p: any) => `token-${p.tokenType}`), verify: jest.fn() };
      sessionRepo = {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((x) => x),
        createQueryBuilder: jest.fn(() => ({
          update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: jest.fn() })) })) })),
        })),
      };
      const users: any = {
        findOne: jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com', roleId: 'r', isActive: true }),
        findOneWithPassword: jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com', password: 'h', roleId: 'r', isActive: true }),
        resetFailedLogin: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: JwtService, useValue: jwt },
          { provide: UsersService, useValue: users },
          { provide: AuditLogService, useValue: { log: jest.fn() } },
          { provide: getRepositoryToken(Session), useValue: sessionRepo },
          { provide: getRepositoryToken(Role), useValue: { findOne: jest.fn().mockResolvedValue({ id: 'viewer-role-uuid' }) } },
        ],
      }).compile();
      service = module.get(AuthService);
    });

    it('access token is signed with tokenType=access', async () => {
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);
      await service.login({ email: 't@x.com', password: 'p' });
      const accessCall = jwt.sign.mock.calls.find((c: any[]) => c[0]?.tokenType === 'access');
      expect(accessCall).toBeDefined();
    });

    it('refresh token is signed with tokenType=refresh', async () => {
      const bcryptjs = await import('bcryptjs');
      jest.spyOn(bcryptjs, 'compare').mockResolvedValue(true as never);
      await service.login({ email: 't@x.com', password: 'p' });
      const refreshCall = jwt.sign.mock.calls.find((c: any[]) => c[0]?.tokenType === 'refresh');
      expect(refreshCall).toBeDefined();
    });

    it('refresh rejects a token with tokenType=access (specific message, before DB lookup)', async () => {
      jwt.verify.mockReturnValue({ sub: 'u1', email: 't@x.com', tokenType: 'access' });
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
