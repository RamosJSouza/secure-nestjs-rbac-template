import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLogsCreatedAtIndex1740500000001 implements MigrationInterface {
  name = 'AuditLogsCreatedAtIndex1740500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at"`);
  }
}
