import { Repository } from 'typeorm';
import { RolePermission } from '../entities/role-permission.entity';

export async function fetchPermissionStringsForRole(
  repo: Repository<RolePermission>,
  roleId: string,
): Promise<string[]> {
  const rows = await repo
    .createQueryBuilder('rp')
    .innerJoin('rp.permission', 'p')
    .innerJoin('p.feature', 'f')
    .select(['f.key AS feature_key', 'p.action AS action'])
    .where('rp.role_id = :roleId', { roleId })
    .getRawMany<{ feature_key: string; action: string }>();

  return rows.map((r) => `${r.feature_key}:${r.action}`);
}

export async function fetchRoleIdsForPermission(
  repo: Repository<RolePermission>,
  permissionId: string,
): Promise<string[]> {
  const rows = await repo
    .createQueryBuilder('rp')
    .select('rp.role_id', 'role_id')
    .where('rp.permission_id = :permissionId', { permissionId })
    .distinct()
    .getRawMany<{ role_id: string }>();

  return rows.map((r) => r.role_id);
}
