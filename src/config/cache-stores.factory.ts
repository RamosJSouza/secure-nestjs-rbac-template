import { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { Keyv, KeyvStoreAdapter } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';
import { resolveRedisConnection } from './redis-connection.factory';

interface CacheOptions {
  ttl: number;
  stores: (Keyv | KeyvStoreAdapter)[];
}

let sharedRedisStore: KeyvRedis<unknown> | null = null;
let sharedMemoryStore: KeyvCacheableMemory | null = null;

export const RBAC_GLOBAL_EPOCH_KEY = 'rbac:global:epoch';

export function getSharedRedisStore(): KeyvRedis<unknown> | null {
  return sharedRedisStore;
}

async function getRedisClient() {
  const store = getSharedRedisStore();
  if (!store) {
    return null;
  }
  return store.getClient();
}

/** Reads RBAC global epoch directly from Redis (bypasses L1 cache-manager tier). */
export async function readRbacGlobalEpoch(): Promise<number | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  const raw = await client.get(RBAC_GLOBAL_EPOCH_KEY);
  if (raw == null) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Atomically increments RBAC global epoch in Redis (INCR). */
export async function incrementRbacGlobalEpoch(): Promise<number> {
  const client = await getRedisClient();
  if (!client) {
    throw new Error('Redis store not available');
  }

  return Number(await client.incr(RBAC_GLOBAL_EPOCH_KEY));
}

export function buildCacheStores(configService: ConfigService): (Keyv | KeyvStoreAdapter)[] {
  const redis = resolveRedisConnection(configService);

  if (redis) {
    if (!sharedRedisStore) {
      sharedRedisStore = new KeyvRedis<unknown>({
        socket: { host: redis.host, port: redis.port },
        ...(redis.password ? { password: redis.password } : {}),
      });
    }
    if (!sharedMemoryStore) {
      sharedMemoryStore = new KeyvCacheableMemory();
    }
    return [new Keyv({ store: sharedMemoryStore }), sharedRedisStore];
  }

  if (!sharedMemoryStore) {
    sharedMemoryStore = new KeyvCacheableMemory();
  }
  return [new Keyv({ store: sharedMemoryStore })];
}

export function buildCacheStoresOptions(configService: ConfigService): CacheOptions {
  return {
    ttl: configService.get<number>('RBAC_CACHE_TTL') ?? 300_000,
    stores: buildCacheStores(configService),
  };
}
