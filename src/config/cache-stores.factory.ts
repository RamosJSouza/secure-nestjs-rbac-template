import { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { Keyv, KeyvStoreAdapter } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

interface CacheOptions {
  ttl: number;
  stores: (Keyv | KeyvStoreAdapter)[];
}

let sharedRedisStore: KeyvRedis<unknown> | null = null;

export function getSharedRedisStore(): KeyvRedis<unknown> | null {
  return sharedRedisStore;
}

export function buildCacheStores(configService: ConfigService): (Keyv | KeyvStoreAdapter)[] {
  const host = configService.get<string>('REDIS_HOST');
  const port = Number(configService.get<string | number>('REDIS_PORT')) || 6379;

  if (host) {
    sharedRedisStore = new KeyvRedis<unknown>({ socket: { host, port } });
    return [sharedRedisStore];
  }
  return [new Keyv({ store: new KeyvCacheableMemory() })];
}

export function buildCacheStoresOptions(configService: ConfigService): CacheOptions {
  return {
    ttl: configService.get<number>('RBAC_CACHE_TTL') ?? 300_000,
    stores: buildCacheStores(configService),
  };
}
