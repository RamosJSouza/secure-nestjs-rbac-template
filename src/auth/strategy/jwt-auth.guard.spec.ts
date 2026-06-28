import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard (S10)', () => {
  it('allows routes marked @Public() without a token', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    const guard = new JwtAuthGuard(reflector);
    const ctx = { getHandler: () => ({}), getClass: () => ({}) } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('delegates to Passport (super) for non-public routes', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    const guard = new JwtAuthGuard(reflector);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toBeDefined();
  });
});
