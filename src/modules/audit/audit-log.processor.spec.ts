import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { AuditLogProcessor } from './audit-log.processor';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditLogProcessor', () => {
  it('persists job payload via AuditLogService', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockImplementation((dto) => dto);
    const module = await Test.createTestingModule({
      providers: [
        AuditLogProcessor,
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: { create, save } },
      ],
    }).compile();
    const processor = module.get(AuditLogProcessor);

    const payload = {
      action: 'auth.login_success',
      entityType: 'User',
      entityId: 'u1',
      actorUserId: 'u1',
      correlationId: 'c1',
      metadata: { source: 'test' },
      ip: '127.0.0.1',
      userAgent: 'jest',
    };

    await processor.process({ data: payload } as Job);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login_success',
        actorUserId: 'u1',
        correlationId: 'c1',
        metadata: { source: 'test' },
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    );
    expect(save).toHaveBeenCalled();
  });
});
