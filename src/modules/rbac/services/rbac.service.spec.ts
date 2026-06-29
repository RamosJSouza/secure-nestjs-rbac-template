import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { RbacService } from './rbac.service';
import { RolePermission } from '../entities/role-permission.entity';

describe('RbacService', () => {
    let service: RbacService;
    let mockRepository: any;
    let mockCacheManager: any;
    let mockConfigService: any;

    beforeEach(async () => {
        mockRepository = {
            find: jest.fn(),
        };

        mockCacheManager = {
            get: jest.fn(),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
        };

        mockConfigService = {
            get: jest.fn().mockReturnValue(300),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RbacService,
                {
                    provide: getRepositoryToken(RolePermission),
                    useValue: mockRepository,
                },
                {
                    provide: CACHE_MANAGER,
                    useValue: mockCacheManager,
                },
                {
                    provide: ConfigService,
                    useValue: mockConfigService,
                },
            ],
        }).compile();

        service = module.get<RbacService>(RbacService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('checkPermissions', () => {
        it('should return false if roleId or permissions are missing', async () => {
            expect(await service.checkPermissions('', ['test:view'])).toBe(false);
            expect(await service.checkPermissions('role-id', [])).toBe(false);
        });

        it('should return true if user has all required permissions', async () => {
            const roleId = 'role-123';
            const requiredPermissions = ['test:view', 'test:edit'];

            // Mock cache miss
            mockCacheManager.get.mockResolvedValue(null);

            // Mock DB response
            mockRepository.find.mockResolvedValue([
                { permission: { action: 'view', feature: { key: 'test' } } },
                { permission: { action: 'edit', feature: { key: 'test' } } },
            ]);

            const result = await service.checkPermissions(roleId, requiredPermissions);
            expect(result).toBe(true);
            expect(mockCacheManager.set).toHaveBeenCalled();
        });

        it('should return false if user is missing a permission', async () => {
            const roleId = 'role-123';
            const requiredPermissions = ['test:view', 'test:admin'];

            mockCacheManager.get.mockResolvedValue(['test:view']);

            const result = await service.checkPermissions(roleId, requiredPermissions);
            expect(result).toBe(false);
        });

        it('should use cached permissions', async () => {
            const roleId = 'role-123';
            mockCacheManager.get.mockResolvedValue(['test:view']);

            const result = await service.checkPermissions(roleId, ['test:view']);
            expect(result).toBe(true);
            expect(mockRepository.find).not.toHaveBeenCalled();
        });

        it('should handle cache error gracefully (fallback to DB)', async () => {
            mockCacheManager.get.mockRejectedValue(new Error('Redis down'));

            mockRepository.find.mockResolvedValue([
                { permission: { action: 'view', feature: { key: 'test' } } }
            ]);

            const result = await service.getPermissionsForRole('role-123');
            expect(result).toEqual(['test:view']);
        });
    });

    describe('invalidateRoleCache', () => {
        it('should delete keys from cache', async () => {
            await service.invalidateRoleCache('role-123');
            expect(mockCacheManager.del).toHaveBeenCalledWith('rbac:role:role-123:permissions');
        });
    });

    describe('invalidateAllRoles', () => {
        it('should delete every previously registered role cache key', async () => {
            mockCacheManager.get.mockResolvedValue(null);
            mockRepository.find.mockResolvedValue([
                { permission: { action: 'view', feature: { key: 'test' } } },
            ]);

            await service.getPermissionsForRole('role-1');
            await service.getPermissionsForRole('role-2');

            await service.invalidateAllRoles();

            expect(mockCacheManager.del).toHaveBeenCalledWith('rbac:role:role-1:permissions');
            expect(mockCacheManager.del).toHaveBeenCalledWith('rbac:role:role-2:permissions');
        });

        it('should not throw when no role has been cached', async () => {
            await expect(service.invalidateAllRoles()).resolves.toBeUndefined();
        });
    });
});
