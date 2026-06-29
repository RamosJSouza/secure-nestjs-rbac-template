import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { RequestContext } from '@/logger/request-context';
import { AUDIT_LOG_JOB, AUDIT_LOG_QUEUE } from './audit-queue.constants';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditLogJobPayload {
  action: string;
  entityType: string;
  entityId?: string;
  actorUserId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId?: string;
  /**
   * `undefined` (or omitted) → fall back to RequestContext.getUserId();
   * `null` → persist null (actor genuinely unknown, e.g. token reuse / lockout);
   * `string` → explicit actor.
   */
  actorUserId?: string | null;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService implements OnModuleInit {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @Optional() @InjectQueue(AUDIT_LOG_QUEUE) private readonly auditQueue?: Queue,
  ) {}

  onModuleInit(): void {
    if (!this.auditQueue) {
      this.logger.log('Audit async disabled — Redis not configured');
    }
  }

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const payload = this.buildPayload(entry);

      if (this.auditQueue) {
        await this.auditQueue.add(AUDIT_LOG_JOB, payload, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 1000,
        });
        return;
      }

      await this.persistFromPayload(payload);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log: ${entry.action} ${entry.entityType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async persistFromPayload(payload: AuditLogJobPayload): Promise<void> {
    const auditLog = this.auditLogRepository.create({
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      actorUserId: payload.actorUserId ?? null,
      correlationId: payload.correlationId ?? null,
      metadata: payload.metadata ?? {},
      ip: payload.ip ?? null,
      userAgent: payload.userAgent ?? null,
    });
    await this.auditLogRepository.save(auditLog);
  }

  private buildPayload(entry: AuditLogEntry): AuditLogJobPayload {
    return {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      actorUserId:
        entry.actorUserId === undefined ? RequestContext.getUserId() : entry.actorUserId,
      correlationId: entry.correlationId ?? RequestContext.getCorrelationId() ?? null,
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    };
  }
}
