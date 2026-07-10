import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserAdminService } from './user-admin.service';
import { UsersService } from '@/users/users.service';
import { SESSION_REVOCATION_PORT } from '@/common/ports/session-revocation.port';

describe('UserAdminService', () => {
  let service: UserAdminService;
  let usersService: { findById: jest.Mock; setActive: jest.Mock };
  let sessionRevocation: { revokeAllUserSessions: jest.Mock };

  beforeEach(async () => {
    usersService = { findById: jest.fn(), setActive: jest.fn().mockResolvedValue(1) };
    sessionRevocation = { revokeAllUserSessions: jest.fn().mockResolvedValue(3) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAdminService,
        { provide: UsersService, useValue: usersService },
        { provide: SESSION_REVOCATION_PORT, useValue: sessionRevocation },
      ],
    }).compile();
    service = module.get(UserAdminService);
  });

  it('throws NotFoundException when the user does not exist', async () => {
    usersService.findById.mockResolvedValue(null);
    await expect(service.setUserActive('nope', false)).rejects.toThrow(NotFoundException);
    expect(usersService.setActive).not.toHaveBeenCalled();
    expect(sessionRevocation.revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when setActive affects zero rows', async () => {
    usersService.findById.mockResolvedValue({ id: 'u1' });
    usersService.setActive.mockResolvedValue(0);
    await expect(service.setUserActive('u1', false)).rejects.toThrow(NotFoundException);
    expect(sessionRevocation.revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it('deactivating a user persists isActive=false and revokes + denylists all sessions', async () => {
    usersService.findById.mockResolvedValue({ id: 'u1', isActive: true });
    const result = await service.setUserActive('u1', false);
    expect(result).toEqual({ id: 'u1', isActive: false });
    expect(usersService.setActive).toHaveBeenCalledWith('u1', false);
    expect(sessionRevocation.revokeAllUserSessions).toHaveBeenCalledWith('u1');
  });

  it('activating a user persists isActive=true and does NOT revoke sessions', async () => {
    usersService.findById.mockResolvedValue({ id: 'u1', isActive: false });
    const result = await service.setUserActive('u1', true);
    expect(result).toEqual({ id: 'u1', isActive: true });
    expect(usersService.setActive).toHaveBeenCalledWith('u1', true);
    expect(sessionRevocation.revokeAllUserSessions).not.toHaveBeenCalled();
  });
});
