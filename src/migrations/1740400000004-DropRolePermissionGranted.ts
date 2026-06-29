import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRolePermissionGranted1740400000004 implements MigrationInterface {
  name = 'DropRolePermissionGranted1740400000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "granted"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD "granted" boolean NOT NULL DEFAULT true`,
    );
  }
}
