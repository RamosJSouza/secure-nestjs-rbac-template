import dataSource from '../../config/typeorm.datasource';
import { seedRbac } from './rbac.seed';

async function run() {
  let exitCode = 0;
  console.log('🌱 RBAC Seed: starting...');

  try {
    await dataSource.initialize();
    console.log('🌱 RBAC Seed: database connected');

    await seedRbac(dataSource);

    console.log('🌱 RBAC Seed: completed successfully');
  } catch (err) {
    console.error('🌱 RBAC Seed: failed', err);
    exitCode = 1;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('🌱 RBAC Seed: connection closed');
    }
    process.exit(exitCode);
  }
}

run();
