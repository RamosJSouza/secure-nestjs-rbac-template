import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionJti1740400000001 implements MigrationInterface {
  name = 'AddSessionJti1740400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" ADD "jti" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "jti"`);
  }
}
