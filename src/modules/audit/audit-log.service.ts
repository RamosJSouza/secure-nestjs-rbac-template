import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { RequestContext } from '@/logger/request-context';

export interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId?: string;
  actorUserId?: string;
  organizationId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const correlationId = entry.correlationId ?? RequestContext.getCorrelationId();
      const auditLog = this.auditLogRepository.create({
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorUserId: entry.actorUserId === undefined ? RequestContext.getUserId() : entry.actorUserId,
        organizationId: entry.organizationId ?? RequestContext.getOrganizationId(),
        correlationId: correlationId ?? null,
        metadata: entry.metadata ?? {},
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      });
      await this.auditLogRepository.save(auditLog);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log: ${entry.action} ${entry.entityType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
