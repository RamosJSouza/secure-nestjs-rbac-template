import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { RequestContext } from '@/logger/request-context';
import { AUDIT_LOG_JOB, AUDIT_LOG_QUEUE } from './audit-queue.constants';

describe('AuditLogService (B19)', () => {
  it('persists audit log without organizationId field', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockImplementation((dto) => dto);
    const module = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: { create, save } },
      ],
    }).compile();
    const service = module.get(AuditLogService);
    await RequestContext.run({ correlationId: 'c1', userId: 'u1' }, async () => {
      await service.log({ action: 'test.action', entityType: 'User', entityId: 'u1' });
    });
    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ organizationId: expect.anything() }),
    );
  });
});

describe('AuditLogService (async)', () => {
  it('enqueues audit job with resolved context when queue is injected', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const save = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockImplementation((dto) => dto);
    const module = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: { create, save } },
        { provide: getQueueToken(AUDIT_LOG_QUEUE), useValue: { add } },
      ],
    }).compile();
    const service = module.get(AuditLogService);

    await RequestContext.run({ correlationId: 'c1', userId: 'ctx-user' }, async () => {
      await service.log({
        action: 'auth.login_success',
        entityType: 'User',
        entityId: 'u1',
        actorUserId: 'u1',
      });
    });

    expect(add).toHaveBeenCalledWith(
      AUDIT_LOG_JOB,
      expect.objectContaining({
        action: 'auth.login_success',
        actorUserId: 'u1',
        correlationId: 'c1',
      }),
      expect.objectContaining({ attempts: 3 }),
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('persists synchronously when queue is not injected', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockImplementation((dto) => dto);
    const module = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: { create, save } },
      ],
    }).compile();
    const service = module.get(AuditLogService);

    await RequestContext.run({ correlationId: 'c2', userId: 'u2' }, async () => {
      await service.log({ action: 'user.updated', entityType: 'User', entityId: 'u2' });
    });

    expect(save).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.updated',
        actorUserId: 'u2',
        correlationId: 'c2',
      }),
    );
  });
});
