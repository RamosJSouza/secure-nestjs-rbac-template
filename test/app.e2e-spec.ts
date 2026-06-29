import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  RedisContainer,
  StartedRedisContainer,
} from '@testcontainers/redis';
import { seedRbac } from '../src/migrations/seeds/rbac.seed';

describe('AppModule e2e (I3)', () => {
  let app: INestApplication;
  let pg: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    redis = await new RedisContainer('redis:7-alpine').start();

    process.env.DB_HOST = pg.getHost();
    process.env.DB_PORT = String(pg.getMappedPort(5432));
    process.env.DB_USERNAME = pg.getUsername();
    process.env.DB_PASSWORD = pg.getPassword();
    process.env.DB_DATABASE = pg.getDatabase();
    process.env.DB_SSL = 'false';
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '*';

    if (!process.env.PRIVATE_KEY || !process.env.PUBLIC_KEY) {
      const { generateKeyPairSync } = await import('crypto');
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      process.env.PRIVATE_KEY = privateKey
        .export({ type: 'pkcs1', format: 'pem' })
        .toString();
      process.env.PUBLIC_KEY = publicKey
        .export({ type: 'pkcs1', format: 'pem' })
        .toString();
    }

    const { buildDataSourceOptions } = await import('../src/config/database.options');
    const { AppModule } = await import('../src/app.module');

    const ds = new DataSource({ ...buildDataSourceOptions(), synchronize: false });
    await ds.initialize();
    await ds.runMigrations({ transaction: 'each' });
    await seedRbac(ds);
    await ds.destroy();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await redis?.stop();
    await pg?.stop();
  });

  it('GET / is public and returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
  });

  it('GET /health/liveness is public', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.status).toBe(200);
  });

  it('protected route without token returns 401 (default-deny)', async () => {
    const res = await request(app.getHttpServer()).get('/roles');
    expect(res.status).toBe(401);
  });
});
