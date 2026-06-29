import { HealthIndicatorService } from '@nestjs/terminus';
import {
  RedisHealthIndicator,
  RedisPinger,
  createRedisPingerFromStore,
} from './redis.health';

type PingerStore = { getClient(): Promise<{ ping(): Promise<unknown> }> };

function makeIndicator(pinger: RedisPinger | null) {
  const up = jest.fn().mockReturnValue({ redis: { status: 'up' } });
  const down = jest.fn().mockReturnValue({ redis: { status: 'down' } });
  const healthIndicator = {
    check: jest.fn().mockReturnValue({ up, down }),
  } as unknown as HealthIndicatorService;
  return {
    indicator: new RedisHealthIndicator(healthIndicator, pinger),
    up,
    down,
  };
}

describe('RedisHealthIndicator (P3)', () => {
  it('pings the shared client and reports up when ping resolves', async () => {
    const ping = jest.fn().mockResolvedValue('PONG');
    const { indicator, up } = makeIndicator({ ping });

    const result = await indicator.isHealthy('redis');

    expect(ping).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
    expect(result.redis.status).toBe('up');
  });

  it('reports down with the error message when ping rejects', async () => {
    const ping = jest.fn().mockRejectedValue(new Error('boom'));
    const { indicator, down } = makeIndicator({ ping });

    const result = await indicator.isHealthy('redis');

    expect(ping).toHaveBeenCalledTimes(1);
    expect(down).toHaveBeenCalledTimes(1);
    expect(down).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    expect(result.redis.status).toBe('down');
  });

  it('reports up with a not-configured message when no pinger is provided', async () => {
    const { indicator, up } = makeIndicator(null);

    const result = await indicator.isHealthy('redis');

    expect(up).toHaveBeenCalledWith({ message: 'Redis not configured, skipping' });
    expect(result.redis.status).toBe('up');
  });
});

describe('createRedisPingerFromStore', () => {
  it('calls getClient().then(ping)', async () => {
    const ping = jest.fn().mockResolvedValue('PONG');
    const store = { getClient: jest.fn().mockResolvedValue({ ping }) } as unknown as PingerStore;
    const pinger = createRedisPingerFromStore(store);

    await pinger.ping();

    expect(store.getClient).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });
});
