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
