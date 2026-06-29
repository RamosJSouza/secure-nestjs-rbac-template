import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PurgeService } from './purge.service';
import { Session } from '@/modules/auth/entities/session.entity';
import { AuditLog } from '@/modules/audit/entities/audit-log.entity';

function mockQueryBuilder(affectedSequence: number[]) {
  let callIndex = 0;
  const execute = jest.fn().mockImplementation(async () => {
    const affected = affectedSequence[callIndex] ?? 0;
    callIndex += 1;
    return { affected };
  });
  const where = jest.fn().mockReturnValue({ execute });
  const deleteFn = jest.fn().mockReturnValue({ where });
  return { delete: deleteFn, where, execute };
}

describe('PurgeService', () => {
  let service: PurgeService;
  let sessionQb: ReturnType<typeof mockQueryBuilder>;
  let auditQb: ReturnType<typeof mockQueryBuilder>;
  let configGet: jest.Mock;

  beforeEach(async () => {
    sessionQb = mockQueryBuilder([1000, 0]);
    auditQb = mockQueryBuilder([1000, 0]);
    configGet = jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        PURGE_ENABLED: true,
        SESSION_GRACE_DAYS: 1,
        AUDIT_RETENTION_DAYS: 90,
        PURGE_BATCH_SIZE: 1000,
      };
      return key in config ? config[key] : defaultValue;
    });

    const module = await Test.createTestingModule({
      providers: [
        PurgeService,
        {
          provide: getRepositoryToken(Session),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(sessionQb),
          },
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(auditQb),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = module.get(PurgeService);
    service.onModuleInit();
  });

  it('runSessionPurge deletes in batch when enabled', async () => {
    await service.runSessionPurge();

    expect(sessionQb.delete).toHaveBeenCalled();
    expect(sessionQb.where).toHaveBeenCalledWith(
      'id IN (SELECT id FROM sessions WHERE expires_at < :cutoff LIMIT :batch)',
      expect.objectContaining({ batch: 1000, cutoff: expect.any(Date) }),
    );
    expect(sessionQb.execute).toHaveBeenCalledTimes(2);
  });

  it('runAuditPurge uses retention days from config', async () => {
    configGet.mockImplementation((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        PURGE_ENABLED: true,
        SESSION_GRACE_DAYS: 1,
        AUDIT_RETENTION_DAYS: 30,
        PURGE_BATCH_SIZE: 1000,
      };
      return key in config ? config[key] : defaultValue;
    });
    service.onModuleInit();

    const before = new Date();
    before.setDate(before.getDate() - 30);

    await service.runAuditPurge();

    expect(auditQb.where).toHaveBeenCalledWith(
      'id IN (SELECT id FROM audit_logs WHERE "createdAt" < :cutoff LIMIT :batch)',
      expect.objectContaining({
        batch: 1000,
        cutoff: expect.any(Date),
      }),
    );
    const cutoff = auditQb.where.mock.calls[0][1].cutoff as Date;
    const expected = new Date();
    expected.setDate(expected.getDate() - 30);
    expect(cutoff.getDate()).toBe(expected.getDate());
  });

  it('skips purge when PURGE_ENABLED=false', async () => {
    configGet.mockImplementation((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        PURGE_ENABLED: false,
        SESSION_GRACE_DAYS: 1,
        AUDIT_RETENTION_DAYS: 90,
        PURGE_BATCH_SIZE: 1000,
      };
      return key in config ? config[key] : defaultValue;
    });
    service.onModuleInit();

    await service.runSessionPurge();
    await service.runAuditPurge();

    expect(sessionQb.delete).not.toHaveBeenCalled();
    expect(auditQb.delete).not.toHaveBeenCalled();
  });
});
