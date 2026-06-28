import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from 'src/modules/rbac/entities/user.entity';

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
  constructor(@InjectRepository(User) private readonly usersRepository: Repository<User>) {}

  create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.usersRepository.create({
      name: createUserDto.name,
      email: createUserDto.email,
      password: createUserDto.password,
      roleId: createUserDto.roleId,
    });

    return this.usersRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
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
    return this.usersRepository.manager.transaction(async (em) => {
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
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { failedLoginAttempts: 0, lockedUntil: null },
    );
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { password: hashedPassword },
    );
  }

  async remove(id: string): Promise<void> {
    await this.usersRepository.softDelete(id);
  }
}
