import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { isRedisConfigured } from './redis-connection.factory';

@Module({})
export class OptionalBullModule {
  static register(): DynamicModule {
    if (!isRedisConfigured()) {
      return { module: OptionalBullModule, imports: [], providers: [], exports: [] };
    }

    const host = process.env.REDIS_HOST!;
    const port = Number(process.env.REDIS_PORT) || 6379;

    return {
      module: OptionalBullModule,
      imports: [
        BullModule.forRoot({
          connection: { host, port, maxRetriesPerRequest: null },
        }),
      ],
      exports: [BullModule],
    };
  }
}
