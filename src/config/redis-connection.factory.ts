import { ConfigService } from '@nestjs/config';

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_HOST);
}

export function buildRedisConnectionOptions(configService: ConfigService): {
  host: string;
  port: number;
} | null {
  const host = configService.get<string>('REDIS_HOST');
  if (!host) return null;
  const port = Number(configService.get<string | number>('REDIS_PORT')) || 6379;
  return { host, port };
}
