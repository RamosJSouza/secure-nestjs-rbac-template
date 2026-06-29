import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import {
  createRedisPingerFromStore,
  RedisHealthIndicator,
  RedisPinger,
} from './indicators/redis.health';
import { getSharedRedisStore } from '@/config/cache-stores.factory';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    {
      provide: 'REDIS_PINGER',
      useFactory: (): RedisPinger | null => {
        const store = getSharedRedisStore();
        if (!store) {
          return null;
        }
        return createRedisPingerFromStore(store);
      },
    },
    RedisHealthIndicator,
  ],
})
export class HealthModule {}
