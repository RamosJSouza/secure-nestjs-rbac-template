import { RedisHealthIndicator, RedisPinger } from './redis.health';

describe('RedisHealthIndicator (P3)', () => {
  it('pings the shared client and reports up when ping resolves', async () => {
    const ping = jest.fn().mockResolvedValue('PONG');
    const sharedClient: RedisPinger = { ping, isOpen: true };
    const indicator = new RedisHealthIndicator(sharedClient);

    const result = await indicator.isHealthy('redis');

    expect(ping).toHaveBeenCalledTimes(1);
    expect(result.redis.status).toBe('up');
  });

  it('reports down when ping rejects', async () => {
    const ping = jest.fn().mockRejectedValue(new Error('boom'));
    const sharedClient: RedisPinger = { ping, isOpen: true };
    const indicator = new RedisHealthIndicator(sharedClient);

    const result = await indicator.isHealthy('redis');

    expect(ping).toHaveBeenCalledTimes(1);
    expect(result.redis.status).toBe('down');
  });

  it('reports up with a not-configured message when no pinger is provided', async () => {
    const indicator = new RedisHealthIndicator(null);

    const result = await indicator.isHealthy('redis');

    expect(result.redis.status).toBe('up');
    expect(result.redis.message).toBe('Redis not configured, skipping');
  });
});
