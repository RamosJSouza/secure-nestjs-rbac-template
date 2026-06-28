import { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { Keyv, KeyvStoreAdapter } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

export interface CacheOptions {
  ttl: number;
  stores: (Keyv | KeyvStoreAdapter)[];
}

export function buildCacheStores(configService: ConfigService): (Keyv | KeyvStoreAdapter)[] {
  const host = configService.get<string>('REDIS_HOST');
  const port = Number(configService.get<string | number>('REDIS_PORT')) || 6379;

  if (host) {
    return [new KeyvRedis({ socket: { host, port } })];
  }
  return [new Keyv({ store: new KeyvCacheableMemory() })];
}

export function buildCacheStoresOptions(configService: ConfigService): CacheOptions {
  return {
    ttl: configService.get<number>('RBAC_CACHE_TTL') ?? 300_000,
    stores: buildCacheStores(configService),
  };
}
