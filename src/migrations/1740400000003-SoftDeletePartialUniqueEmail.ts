import { MigrationInterface, QueryRunner } from 'typeorm';

export class SoftDeletePartialUniqueEmail1740400000003 implements MigrationInterface {
  name = 'SoftDeletePartialUniqueEmail1740400000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_email_active" ON "users" ("email") WHERE "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_active"`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE ("email")`);
  }
}
