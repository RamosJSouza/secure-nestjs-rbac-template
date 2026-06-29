import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { buildDataSourceOptions } from './database.options';

dotenv.config();

export default new DataSource(buildDataSourceOptions());
