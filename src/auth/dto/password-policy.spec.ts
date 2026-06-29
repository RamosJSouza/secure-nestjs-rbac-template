import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { ChangePasswordDto } from './change-password.dto';
import { CreateUserDto } from '@/users/dto/create-user.dto';

async function invalid<T>(obj: T): Promise<boolean> {
  const errors = await validate(obj as object);
  return errors.length > 0;
}

describe('Password policy (D4)', () => {
  it('RegisterDto rejects "short" (no upper/digit, <12)', async () => {
    expect(await invalid(plainToInstance(RegisterDto, {
      email: 'a@b.com', name: 'N', password: 'short',
    }))).toBe(true);
  });

  it('RegisterDto accepts "Abcdefgh1234" (12 chars, upper + lower + digit)', async () => {
    expect(await invalid(plainToInstance(RegisterDto, {
      email: 'a@b.com', name: 'N', password: 'Abcdefgh1234',
    }))).toBe(false);
  });

  it('ChangePasswordDto rejects "alllowercase"', async () => {
    expect(await invalid(plainToInstance(ChangePasswordDto, {
      currentPassword: 'X', newPassword: 'alllowercase',
    }))).toBe(true);
  });

  it('ChangePasswordDto accepts "Abcdefgh1234" (12 chars, upper + lower + digit)', async () => {
    expect(await invalid(plainToInstance(ChangePasswordDto, {
      currentPassword: 'X', newPassword: 'Abcdefgh1234',
    }))).toBe(false);
  });

  it('CreateUserDto rejects "short" (no upper/digit, <12)', async () => {
    expect(await invalid(plainToInstance(CreateUserDto, {
      email: 'a@b.com', name: 'N', password: 'short',
    }))).toBe(true);
  });

  it('CreateUserDto accepts "Abcdefgh1234"', async () => {
    expect(await invalid(plainToInstance(CreateUserDto, {
      email: 'a@b.com', name: 'N', password: 'Abcdefgh1234',
    }))).toBe(false);
  });
});
