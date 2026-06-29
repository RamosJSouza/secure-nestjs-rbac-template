import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AUDITABLE_KEY } from '../decorators/auditable.decorator';

describe('AuditInterceptor (C2/C3)', () => {
  let interceptor: AuditInterceptor;
  let auditLogService: any;
  let reflector: any;

  beforeEach(() => {
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    reflector = {
      get: jest.fn((_key: string, _handler: unknown) => ({
        action: 'role.assign_permissions',
        entityType: 'Role',
        entityIdParam: 0,
      })),
    };
    interceptor = new AuditInterceptor(reflector, auditLogService);
  });

  function makeCtx(args: unknown[]): ExecutionContext {
    const req: any = {
      ip: '9.9.9.9',
      get: (h: string) => (h === 'user-agent' ? 'UA-test' : undefined),
      socket: {},
      body: { permissionIds: ['p1'] },
    };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
      getArgs: () => args,
    } as unknown as ExecutionContext;
  }

  it('captures ip and userAgent from the request and passes them to log', async () => {
    const ctx = makeCtx(['role-1']);
    const next: CallHandler = { handle: () => of({ id: 'role-1' }) };
    await interceptor.intercept(ctx, next).toPromise();

    expect(reflector.get).toHaveBeenCalledWith(AUDITABLE_KEY, expect.anything());
    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '9.9.9.9', userAgent: 'UA-test' }),
    );
  });

  it('captures permissionIds from the request body when result has none', async () => {
    const req: any = {
      ip: '9.9.9.9',
      get: () => undefined,
      socket: {},
      body: { permissionIds: ['p1', 'p2'] },
    };
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
      getArgs: () => ['role-1'],
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(undefined) };
    await interceptor.intercept(ctx, next).toPromise();

    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ permissionIds: ['p1', 'p2'] }),
      }),
    );
  });
});
