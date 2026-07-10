import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/modules/rbac/entities/user.entity';
import { handlePgConstraintError } from '@/common/utils/pg-constraint-error.util';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const WITH_PASSWORD_SELECT = {
  id: true,
  email: true,
  name: true,
  password: true,
  roleId: true,
  isActive: true,
  lockedUntil: true,
  failedLoginAttempts: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheManager.del(`user:${userId}`);
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.usersRepository.create({
      name: createUserDto.name,
      email: createUserDto.email,
      password: createUserDto.password,
      roleId: createUserDto.roleId,
    });

    try {
      return await this.usersRepository.save(user);
    } catch (err) {
      handlePgConstraintError(err, {
        onUnique: () => {
          throw new ConflictException('User already exists');
        },
      });
    }
  }

  findOne(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
    });
  }

  findOneWithPassword(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      select: WITH_PASSWORD_SELECT,
    });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
    });
  }

  findByIdWithPassword(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      select: WITH_PASSWORD_SELECT,
    });
  }

  async recordFailedLogin(userId: string): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    const result = await this.usersRepository.manager.transaction(async (em) => {
      await em.increment(User, { id: userId }, 'failedLoginAttempts', 1);
      const updated = await em.findOne(User, { where: { id: userId } });
      if (!updated) throw new Error('User not found');
      const now = new Date();
      const shouldLock =
        updated.failedLoginAttempts >= LOCKOUT_THRESHOLD &&
        (!updated.lockedUntil || updated.lockedUntil <= now);
      if (shouldLock) {
        updated.lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
        await em.save(updated);
      }
      return { failedLoginAttempts: updated.failedLoginAttempts, lockedUntil: updated.lockedUntil };
    });
    await this.invalidateUserCache(userId);
    return result;
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { failedLoginAttempts: 0, lockedUntil: null },
    );
    await this.invalidateUserCache(userId);
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { password: hashedPassword },
    );
    await this.invalidateUserCache(userId);
  }

  async setActive(userId: string, active: boolean): Promise<void> {
    await this.usersRepository.update({ id: userId }, { isActive: active });
    await this.invalidateUserCache(userId);
  }
}
