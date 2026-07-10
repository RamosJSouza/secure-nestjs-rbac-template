import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccessJtiAndRotatedToSession1783710727556
  implements MigrationInterface
{
  name = 'AddAccessJtiAndRotatedToSession1783710727556';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "access_jti" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "rotated_to_session_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sessions_access_jti" ON "sessions" ("access_jti")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sessions_access_jti"`);
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP COLUMN IF EXISTS "rotated_to_session_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP COLUMN IF EXISTS "access_jti"`,
    );
  }
}
