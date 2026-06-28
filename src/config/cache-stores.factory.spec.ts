import { buildCacheStores, buildCacheStoresOptions } from './cache-stores.factory';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';

describe('buildCacheStores (S3)', () => {
  it('returns a memory store when REDIS_HOST is not set', () => {
    const cfg: any = { get: (k: string) => undefined };
    const stores = buildCacheStores(cfg);
    expect(stores.length).toBe(1);
    expect(stores[0]).toBeDefined();
    expect(typeof stores[0].get).toBe('function');
    expect(stores[0]).toBeInstanceOf(Keyv);
    expect(stores[0]).not.toBeInstanceOf(KeyvRedis);
  });

  it('returns a KeyvRedis-backed store when REDIS_HOST is set (no eager connect)', () => {
    const cfg: any = { get: (k: string) => (k === 'REDIS_HOST' ? 'redis' : 6379) };
    const stores = buildCacheStores(cfg);
    expect(stores.length).toBe(1);
    expect(stores[0]).toBeDefined();
    expect(typeof stores[0].get).toBe('function');
    expect(stores[0]).toBeInstanceOf(KeyvRedis);
  });

  it('respects RBAC_CACHE_TTL when provided', () => {
    const cfg: any = { get: (k: string) => (k === 'RBAC_CACHE_TTL' ? 60000 : undefined) };
    const { ttl } = buildCacheStoresOptions(cfg);
    expect(ttl).toBe(60000);
  });

  it('defaults RBAC_CACHE_TTL to 300000 when not provided', () => {
    const cfg: any = { get: () => undefined };
    const { ttl } = buildCacheStoresOptions(cfg);
    expect(ttl).toBe(300_000);
  });
});
