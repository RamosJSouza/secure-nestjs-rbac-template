import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

export interface RedisPinger {
  ping(): Promise<unknown>;
}

export function createRedisPingerFromStore(store: {
  getClient(): Promise<{ ping(): Promise<unknown> }>;
}): RedisPinger {
  return {
    ping: () => store.getClient().then((client) => client.ping()),
  };
}

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicator: HealthIndicatorService,
    @Inject('REDIS_PINGER') private readonly redis: RedisPinger | null,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const check = this.healthIndicator.check(key);
    if (!this.redis) {
      return check.up({ message: 'Redis not configured, skipping' });
    }
    try {
      await this.redis.ping();
      return check.up();
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }
}
