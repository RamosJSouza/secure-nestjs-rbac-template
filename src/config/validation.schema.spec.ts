import { validationSchema } from './validation.schema';

const baseEnv = {
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_DATABASE: 'app',
  PRIVATE_KEY: 'x',
  PUBLIC_KEY: 'x',
  ALLOWED_ORIGINS: '*',
};

describe('validationSchema (S12)', () => {
  it('rejects empty PRIVATE_KEY in development', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
      PRIVATE_KEY: '',
    });
    expect(error).toBeDefined();
  });

  it('rejects empty PUBLIC_KEY in test', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'test',
      PUBLIC_KEY: '',
    });
    expect(error).toBeDefined();
  });

  it('accepts non-empty keys in development', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
    });
    expect(error).toBeUndefined();
  });
});

describe('validationSchema (P6 purge)', () => {
  it('applies purge defaults when vars are omitted', () => {
    const { error, value } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
    });
    expect(error).toBeUndefined();
    expect(value.PURGE_ENABLED).toBe(true);
    expect(value.SESSION_PURGE_CRON).toBe('0 3 * * *');
    expect(value.SESSION_GRACE_DAYS).toBe(1);
    expect(value.AUDIT_RETENTION_DAYS).toBe(90);
    expect(value.AUDIT_PURGE_CRON).toBe('0 4 * * *');
    expect(value.PURGE_BATCH_SIZE).toBe(1000);
  });

  it('coerces PURGE_ENABLED from string env values', () => {
    const { error, value } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
      PURGE_ENABLED: 'false',
    });
    expect(error).toBeUndefined();
    expect(value.PURGE_ENABLED).toBe(false);
  });

  it('rejects AUDIT_RETENTION_DAYS below minimum', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
      AUDIT_RETENTION_DAYS: 0,
    });
    expect(error).toBeDefined();
  });
});

describe('validationSchema (ACHADO-5 single-tenant)', () => {
  it('rejects MULTI_TENANT=true with a clear message', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
      MULTI_TENANT: 'true',
    });
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/MULTI_TENANT=true is not supported/);
  });

  it('accepts MULTI_TENANT=false', () => {
    const { error, value } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
      MULTI_TENANT: 'false',
    });
    expect(error).toBeUndefined();
    expect(value.MULTI_TENANT).toBe('false');
  });

  it('defaults MULTI_TENANT to false when unset', () => {
    const { error, value } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
    });
    expect(error).toBeUndefined();
    expect(value.MULTI_TENANT).toBe('false');
  });
});
