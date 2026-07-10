import { ConfigService } from '@nestjs/config';

export function isRedisConfigured(configService?: Pick<ConfigService, 'get'>): boolean {
  return Boolean(resolveRedisHost(configService));
}

export function resolveRedisHost(configService?: Pick<ConfigService, 'get'>): string | undefined {
  const fromConfig = configService?.get<string>('REDIS_HOST');
  if (fromConfig) return fromConfig;
  return process.env.REDIS_HOST;
}

export function resolveRedisConnection(
  configService?: Pick<ConfigService, 'get'>,
): { host: string; port: number; password?: string } | null {
  const host = resolveRedisHost(configService);
  if (!host) return null;

  const port =
    Number(configService?.get<string | number>('REDIS_PORT') ?? process.env.REDIS_PORT) || 6379;
  const password = configService?.get<string>('REDIS_PASSWORD') ?? process.env.REDIS_PASSWORD;

  return password ? { host, port, password } : { host, port };
}
