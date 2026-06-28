import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

if (
  process.env.DB_SSL === 'true' &&
  process.env.NODE_ENV === 'production' &&
  !process.env.DB_SSL_CA
) {
  throw new Error(
    'DB_SSL_CA is required when DB_SSL=true and NODE_ENV=production (refusing to connect with unverified server certificate)',
  );
}

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize:
    process.env.NODE_ENV !== 'production' &&
    (process.env.NODE_ENV === 'development' || process.env.DB_SYNCHRONIZE === 'true'),
  logging: process.env.DB_LOGGING === 'true',
  ssl:
    process.env.DB_SSL === 'true'
      ? { ca: process.env.DB_SSL_CA, rejectUnauthorized: true }
      : false,
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
