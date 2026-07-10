import { fetchPermissionStringsForRole, fetchRoleIdsForPermission } from './role-permission.query';

function qbReturning(rows: Array<{ feature_key: string; action: string }>) {
    const qb: Record<string, jest.Mock> = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
}

describe('fetchPermissionStringsForRole', () => {
    it('joins rp -> permission -> feature and maps rows to featureKey:action strings', async () => {
        const qb = qbReturning([
            { feature_key: 'test', action: 'view' },
            { feature_key: 'billing', action: 'edit' },
        ]);
        const repo: any = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

        const result = await fetchPermissionStringsForRole(repo, 'role-1');

        expect(repo.createQueryBuilder).toHaveBeenCalledWith('rp');
        expect(qb.innerJoin).toHaveBeenNthCalledWith(1, 'rp.permission', 'p');
        expect(qb.innerJoin).toHaveBeenNthCalledWith(2, 'p.feature', 'f');
        expect(qb.where).toHaveBeenCalledWith('rp.role_id = :roleId', { roleId: 'role-1' });
        expect(result).toEqual(['test:view', 'billing:edit']);
    });

    it('returns an empty array when the role has no permissions', async () => {
        const qb = qbReturning([]);
        const repo: any = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

        const result = await fetchPermissionStringsForRole(repo, 'empty-role');
        expect(result).toEqual([]);
    });
});

describe('fetchRoleIdsForPermission', () => {
    function roleIdsQb(roleIds: string[]) {
        const qb: Record<string, jest.Mock> = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            distinct: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue(roleIds.map((id) => ({ role_id: id }))),
        };
        return qb;
    }

    it('selects distinct role_ids assigned to a permission', async () => {
        const qb = roleIdsQb(['role-a', 'role-b']);
        const repo: any = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

        const result = await fetchRoleIdsForPermission(repo, 'perm-1');

        expect(repo.createQueryBuilder).toHaveBeenCalledWith('rp');
        expect(qb.select).toHaveBeenCalledWith('rp.role_id', 'role_id');
        expect(qb.where).toHaveBeenCalledWith('rp.permission_id = :permissionId', { permissionId: 'perm-1' });
        expect(qb.distinct).toHaveBeenCalled();
        expect(result).toEqual(['role-a', 'role-b']);
    });

    it('returns an empty array when no role has the permission', async () => {
        const qb = roleIdsQb([]);
        const repo: any = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

        const result = await fetchRoleIdsForPermission(repo, 'orphan-perm');
        expect(result).toEqual([]);
    });
});
