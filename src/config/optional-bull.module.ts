import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { isRedisConfigured, resolveRedisConnection } from './redis-connection.factory';

@Module({})
export class OptionalBullModule {
  static register(): DynamicModule {
    if (!isRedisConfigured()) {
      return { module: OptionalBullModule, imports: [], providers: [], exports: [] };
    }

    const redis = resolveRedisConnection()!;

    return {
      module: OptionalBullModule,
      imports: [
        BullModule.forRoot({
          connection: {
            host: redis.host,
            port: redis.port,
            ...(redis.password ? { password: redis.password } : {}),
            maxRetriesPerRequest: null,
          },
        }),
      ],
      exports: [BullModule],
    };
  }
}
