import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { Permission } from '../entities/permission.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { RbacService } from './rbac.service';

describe('PermissionService', () => {
    let service: PermissionService;
    let mockPermissionRepo: any;
    let mockRolePermissionRepo: any;
    let mockRbacService: any;

    beforeEach(async () => {
        mockPermissionRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            find: jest.fn(),
        };

        mockRolePermissionRepo = {
            createQueryBuilder: jest.fn(),
        };

        mockRbacService = {
            invalidateRoles: jest.fn().mockResolvedValue(undefined),
            invalidateAllRoles: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PermissionService,
                { provide: getRepositoryToken(Permission), useValue: mockPermissionRepo },
                { provide: getRepositoryToken(RolePermission), useValue: mockRolePermissionRepo },
                { provide: RbacService, useValue: mockRbacService },
            ],
        }).compile();

        service = module.get<PermissionService>(PermissionService);
    });

    function rolePermissionQb(roleIds: string[]) {
        const qb: Record<string, jest.Mock> = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            distinct: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue(roleIds.map((id) => ({ role_id: id }))),
        };
        return qb;
    }

    it('should create new permission', async () => {
        const dto = { action: 'test:view', name: 'Test Permission', featureId: 'feature-1' };
        mockPermissionRepo.create.mockReturnValue(dto);
        mockPermissionRepo.save.mockResolvedValue({ id: '1', ...dto });

        const result = await service.create(dto);
        expect(result).toEqual({ id: '1', ...dto });
    });

    it('should throw on duplicate permission', async () => {
        const error = new Error('Duplicate entry');
        (error as any).code = '23505';

        mockPermissionRepo.save.mockRejectedValue(error);
        await expect(service.create({ action: 'test:view', name: 'Duplicate', featureId: 'ft-1' })).rejects.toThrow();
    });

    it('should find permissions by feature', async () => {
        const permissions = [{ id: '1', action: 'view' }, { id: '2', action: 'edit' }];
        mockPermissionRepo.find.mockResolvedValue(permissions);

        const result = await service.findByFeature('feature-1');
        expect(result).toHaveLength(2);
        expect(mockPermissionRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { featureId: 'feature-1' } }));
    });

    it('should invalidate only affected role caches after updating a permission', async () => {
        mockPermissionRepo.update.mockResolvedValue({ affected: 1 });
        mockPermissionRepo.findOne.mockResolvedValue({ id: '1', action: 'view' });
        mockRolePermissionRepo.createQueryBuilder.mockReturnValue(rolePermissionQb(['role-a', 'role-b']));

        await service.update('1', { name: 'Updated' });

        expect(mockRbacService.invalidateRoles).toHaveBeenCalledWith(['role-a', 'role-b']);
        expect(mockRbacService.invalidateAllRoles).not.toHaveBeenCalled();
    });

    it('should not invalidate caches when permission update targets a missing permission', async () => {
        mockPermissionRepo.update.mockResolvedValue({ affected: 0 });

        await expect(service.update('1', { name: 'Updated' })).rejects.toThrow(NotFoundException);

        expect(mockRbacService.invalidateRoles).not.toHaveBeenCalled();
    });

    it('should invalidate only affected role caches after removing a permission', async () => {
        mockPermissionRepo.delete.mockResolvedValue({ affected: 1 });
        mockRolePermissionRepo.createQueryBuilder.mockReturnValue(rolePermissionQb(['role-a']));

        await service.remove('1');

        expect(mockRbacService.invalidateRoles).toHaveBeenCalledWith(['role-a']);
        expect(mockRbacService.invalidateAllRoles).not.toHaveBeenCalled();
    });

    it('should not invalidate caches when permission removal targets a missing permission', async () => {
        mockRolePermissionRepo.createQueryBuilder.mockReturnValue(rolePermissionQb([]));
        mockPermissionRepo.delete.mockResolvedValue({ affected: 0 });

        await expect(service.remove('missing')).rejects.toThrow(NotFoundException);

        expect(mockRbacService.invalidateRoles).not.toHaveBeenCalled();
    });

    it('should not invalidate caches when permission removal fails with FK violation', async () => {
        const error = new Error('FK violation');
        (error as any).code = '23503';

        mockRolePermissionRepo.createQueryBuilder.mockReturnValue(rolePermissionQb([]));
        mockPermissionRepo.delete.mockRejectedValue(error);

        await expect(service.remove('1')).rejects.toThrow();

        expect(mockRbacService.invalidateRoles).not.toHaveBeenCalled();
    });
});
