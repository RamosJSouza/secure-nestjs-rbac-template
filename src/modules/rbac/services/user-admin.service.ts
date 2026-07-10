import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { UsersService } from '@/users/users.service';
import { SESSION_REVOCATION_PORT, SessionRevocationPort } from '@/common/ports/session-revocation.port';

@Injectable()
export class UserAdminService {
  constructor(
    private readonly usersService: UsersService,
    @Inject(SESSION_REVOCATION_PORT) private readonly sessionRevocation: SessionRevocationPort,
  ) {}

  async setUserActive(userId: string, isActive: boolean): Promise<{ id: string; isActive: boolean }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const affected = await this.usersService.setActive(userId, isActive);
    if (affected === 0) {
      throw new NotFoundException('User not found');
    }
    if (!isActive) {
      await this.sessionRevocation.revokeAllUserSessions(userId);
    }
    return { id: userId, isActive };
  }
}
