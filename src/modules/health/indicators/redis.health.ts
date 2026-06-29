import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

export interface RedisPinger {
  ping(): Promise<unknown>;
  readonly isOpen?: boolean;
}

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisPinger | null) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.redis) {
      return this.getStatus(key, true, { message: 'Redis not configured, skipping' });
    }
    try {
      await this.redis.ping();
      return this.getStatus(key, true);
    } catch (error) {
      return this.getStatus(key, false, { error: (error as Error).message });
    }
  }
}
