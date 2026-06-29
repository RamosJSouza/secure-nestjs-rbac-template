import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator, RedisPinger } from './indicators/redis.health';
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
        const pinger: RedisPinger = {
          ping: () =>
            store.getClient().then((client) => (client as { ping(): Promise<unknown> }).ping()),
          get isOpen(): boolean {
            return Boolean((store.client as { isOpen?: boolean }).isOpen);
          },
        };
        return pinger;
      },
    },
    {
      provide: RedisHealthIndicator,
      useFactory: (pinger: RedisPinger | null) => new RedisHealthIndicator(pinger),
      inject: ['REDIS_PINGER'],
    },
  ],
})
export class HealthModule {}
