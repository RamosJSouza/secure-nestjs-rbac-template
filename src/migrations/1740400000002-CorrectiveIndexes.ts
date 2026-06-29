import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectiveIndexes1740400000002 implements MigrationInterface {
  name = 'CorrectiveIndexes1740400000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_is_active_partial"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_is_active_partial"`);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_email_isActive" ON "users" ("email", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_roleId_isActive" ON "users" ("role_id", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_roles_name_isActive" ON "roles" ("name", "isActive")`,
    );

    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_correlation_id" ON "audit_logs" ("correlation_id") WHERE "correlation_id" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sessions_expires_revoked" ON "sessions" ("expires_at", "revoked_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sessions_expires_revoked"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_correlation_id"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "metadata" DROP DEFAULT`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_name_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_roleId_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_isActive"`);
  }
}
