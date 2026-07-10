import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from '@/users/users.service';
import { AuthService } from '@/auth/auth.service';

@Injectable()
export class UserAdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
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
      // Revoke + denylist immediately so tokens stop working without waiting for the next refresh.
      await this.authService.revokeAllUserSessions(userId);
    }
    return { id: userId, isActive };
  }
}
