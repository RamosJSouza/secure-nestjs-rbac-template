import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  BeforeApplicationShutdown,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { AUDIT_LOG_QUEUE } from '@/modules/audit/audit-queue.constants';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Graceful shutdown: stop accepting requests, close DB, enforce 10s timeout.
 * - HTTP server stops accepting via Nest lifecycle
 * - DB closed explicitly here (TypeOrmModule also closes; we ensure it runs)
 * - Redis: CacheModule uses in-memory store; if Redis cache store is configured,
 *   implement OnApplicationShutdown in that module to close the connection.
 */
@Injectable()
export class GracefulShutdownService
  implements BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(GracefulShutdownService.name);
  private forceExitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() @InjectQueue(AUDIT_LOG_QUEUE) private readonly auditQueue?: Queue,
  ) {}

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutdown signal received: ${signal ?? 'unknown'}`);

    this.forceExitTimer = setTimeout(() => {
      this.logger.error(
        `Shutdown timeout (${SHUTDOWN_TIMEOUT_MS}ms) - forcing exit`,
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      if (this.auditQueue) {
        await this.auditQueue.close();
        this.logger.log('Audit log queue closed');
      }

      if (this.dataSource?.isInitialized) {
        await this.dataSource.destroy();
        this.logger.log('Database connection closed');
      }
    } catch (error) {
      this.logger.error(
        'Error closing database connection',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      if (this.forceExitTimer) {
        clearTimeout(this.forceExitTimer);
        this.forceExitTimer = null;
      }
      this.logger.log('Graceful shutdown complete');
    }
  }
}
