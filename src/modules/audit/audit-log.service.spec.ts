import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { RequestContext } from '@/logger/request-context';

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
