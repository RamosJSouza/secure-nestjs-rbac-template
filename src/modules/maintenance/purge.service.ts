import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '@/modules/auth/entities/session.entity';
import { AuditLog } from '@/modules/audit/entities/audit-log.entity';

const DEFAULT_SESSION_PURGE_CRON = '0 3 * * *';
const DEFAULT_AUDIT_PURGE_CRON = '0 4 * * *';

@Injectable()
export class PurgeService implements OnModuleInit {
  private readonly logger = new Logger(PurgeService.name);
  private purgeEnabled = true;
  private sessionGraceDays = 1;
  private auditRetentionDays = 90;
  private batchSize = 1000;

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.purgeEnabled = this.configService.get<boolean>('PURGE_ENABLED', true);
    this.sessionGraceDays = this.configService.get<number>('SESSION_GRACE_DAYS', 1);
    this.auditRetentionDays = this.configService.get<number>('AUDIT_RETENTION_DAYS', 90);
    this.batchSize = this.configService.get<number>('PURGE_BATCH_SIZE', 1000);
  }

  @Cron(process.env.SESSION_PURGE_CRON ?? DEFAULT_SESSION_PURGE_CRON)
  async handleSessionPurgeCron(): Promise<void> {
    await this.runSessionPurge();
  }

  @Cron(process.env.AUDIT_PURGE_CRON ?? DEFAULT_AUDIT_PURGE_CRON)
  async handleAuditPurgeCron(): Promise<void> {
    await this.runAuditPurge();
  }

  async runSessionPurge(): Promise<void> {
    if (!this.purgeEnabled) {
      return;
    }

    try {
      const cutoff = this.daysAgo(this.sessionGraceDays);
      const totalDeleted = await this.deleteInBatches(
        () =>
          this.sessionRepo
            .createQueryBuilder()
            .delete()
            .where(
              'id IN (SELECT id FROM sessions WHERE expires_at < :cutoff LIMIT :batch)',
              { cutoff, batch: this.batchSize },
            ),
      );

      if (totalDeleted > 0) {
        this.logger.log(`Session purge: deleted ${totalDeleted} rows`);
      }
    } catch (err) {
      this.logger.error('Session purge failed', err);
    }
  }

  async runAuditPurge(): Promise<void> {
    if (!this.purgeEnabled) {
      return;
    }

    try {
      const cutoff = this.daysAgo(this.auditRetentionDays);
      const totalDeleted = await this.deleteInBatches(
        () =>
          this.auditRepo
            .createQueryBuilder()
            .delete()
            .where(
              'id IN (SELECT id FROM audit_logs WHERE "createdAt" < :cutoff LIMIT :batch)',
              { cutoff, batch: this.batchSize },
            ),
      );

      if (totalDeleted > 0) {
        this.logger.log(`Audit purge: deleted ${totalDeleted} rows`);
      }
    } catch (err) {
      this.logger.error('Audit purge failed', err);
    }
  }

  private async deleteInBatches(
    buildDelete: () => { execute: () => Promise<{ affected?: number | null }> },
  ): Promise<number> {
    let totalDeleted = 0;

    while (true) {
      const result = await buildDelete().execute();
      const affected = result.affected ?? 0;
      totalDeleted += affected;

      if (affected < this.batchSize) {
        break;
      }
    }

    return totalDeleted;
  }

  private daysAgo(days: number): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  }
}
