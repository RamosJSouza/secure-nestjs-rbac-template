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
  let executeMock: jest.Mock;

  beforeEach(async () => {
    users = {
      findById: jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com', password: '$2b$10$oldhash', isActive: true }),
      findOne: jest.fn().mockResolvedValue({ id: 'u1', email: 't@x.com', password: '$2b$10$oldhash', isActive: true }),
      updatePassword: jest.fn().mockResolvedValue(undefined),
    };
    executeMock = jest.fn().mockResolvedValue({ affected: 1 });
    const sessionRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ execute: executeMock })) })) })),
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
    expect(executeMock).toHaveBeenCalled();
  });
});
