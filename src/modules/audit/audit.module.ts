import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isRedisConfigured } from '@/config/redis-connection.factory';
import { AUDIT_LOG_QUEUE } from './audit-queue.constants';
import { AuditLogProcessor } from './audit-log.processor';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';

@Global()
@Module({})
export class AuditModule {
  static register(): DynamicModule {
    const redisConfigured = isRedisConfigured();
    const imports: DynamicModule['imports'] = [TypeOrmModule.forFeature([AuditLog])];
    const providers: DynamicModule['providers'] = [
      AuditLogService,
      {
        provide: APP_INTERCEPTOR,
        useClass: AuditInterceptor,
      },
    ];
    const exports: DynamicModule['exports'] = [AuditLogService];

    if (redisConfigured) {
      imports.push(BullModule.registerQueue({ name: AUDIT_LOG_QUEUE }));
      providers.push(AuditLogProcessor);
      exports.push(BullModule);
    }

    return {
      module: AuditModule,
      global: true,
      imports,
      providers,
      exports,
    };
  }
}
