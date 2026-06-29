import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AUDIT_LOG_QUEUE } from './audit-queue.constants';
import { AuditLogJobPayload, AuditLogService } from './audit-log.service';

@Processor(AUDIT_LOG_QUEUE)
export class AuditLogProcessor extends WorkerHost {
  constructor(private readonly auditLogService: AuditLogService) {
    super();
  }

  async process(job: Job<AuditLogJobPayload>): Promise<void> {
    await this.auditLogService.persistFromPayload(job.data);
  }
}
