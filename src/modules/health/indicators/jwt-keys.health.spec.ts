import { HealthIndicatorService } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { JwtKeysHealthIndicator } from './jwt-keys.health';
import { generateTestRsaKeyPair } from '@/common/utils/jwt-keys.util';

describe('JwtKeysHealthIndicator', () => {
  const healthIndicatorService = {
    check: jest.fn((key: string) => ({
      up: jest.fn((data?: Record<string, unknown>) => ({ [key]: { status: 'up', ...data } })),
      down: jest.fn((data?: Record<string, unknown>) => ({ [key]: { status: 'down', ...data } })),
    })),
  } as unknown as HealthIndicatorService;

  it('is up when both keys are valid RSA PEM strings', async () => {
    const { privateKey, publicKey } = generateTestRsaKeyPair();
    const config = {
      get: jest.fn((k: string) =>
        k === 'keys.privateKey' ? privateKey : publicKey,
      ),
    } as unknown as ConfigService;

    const indicator = new JwtKeysHealthIndicator(healthIndicatorService, config);
    const result = await indicator.isHealthy('jwt_keys');
    expect(result.jwt_keys.status).toBe('up');
  });

  it('is down when public key is missing', async () => {
    const config = {
      get: jest.fn(() => ''),
    } as unknown as ConfigService;

    const indicator = new JwtKeysHealthIndicator(healthIndicatorService, config);
    const result = await indicator.isHealthy('jwt_keys');
    expect(result.jwt_keys.status).toBe('down');
  });

  it('is down when keys look like PEM but are cryptographically invalid', async () => {
    const fake = `-----BEGIN PUBLIC KEY-----\n${'B'.repeat(80)}\n-----END PUBLIC KEY-----`;
    const config = {
      get: jest.fn((k: string) =>
        k === 'keys.privateKey' ? fake : fake,
      ),
    } as unknown as ConfigService;

    const indicator = new JwtKeysHealthIndicator(healthIndicatorService, config);
    const result = await indicator.isHealthy('jwt_keys');
    expect(result.jwt_keys.status).toBe('down');
  });
});
