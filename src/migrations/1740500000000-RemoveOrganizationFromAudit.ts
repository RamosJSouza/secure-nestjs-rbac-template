import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class RemoveOrganizationFromAudit1740500000000 implements MigrationInterface {
  name = 'RemoveOrganizationFromAudit1740500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const auditLogsTable = await queryRunner.getTable('audit_logs');
    if (auditLogsTable) {
      const orgFk = auditLogsTable.foreignKeys.find((fk) =>
        fk.columnNames.includes('organization_id'),
      );
      if (orgFk) {
        await queryRunner.dropForeignKey('audit_logs', orgFk);
      }
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_org_created"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "organization_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_organizations_is_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'organizations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
          },
          {
            name: 'slug',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'organizations',
      new TableIndex({
        columnNames: ['isActive'],
        name: 'IDX_organizations_is_active',
      }),
    );

    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organization_id" uuid`,
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        columnNames: ['organization_id', 'createdAt'],
        name: 'IDX_audit_logs_org_created',
      }),
    );

    await queryRunner.createForeignKey(
      'audit_logs',
      new TableForeignKey({
        columnNames: ['organization_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'SET NULL',
      }),
    );
  }
}
