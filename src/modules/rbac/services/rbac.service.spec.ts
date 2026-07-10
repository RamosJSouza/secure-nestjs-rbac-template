import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { RbacService } from './rbac.service';
import { RolePermission } from '../entities/role-permission.entity';
import * as cacheStoresFactory from '@/config/cache-stores.factory';

jest.mock('@/config/cache-stores.factory', () => {
    const actual = jest.requireActual('@/config/cache-stores.factory');
    return {
        ...actual,
        readRbacGlobalEpoch: jest.fn(),
        incrementRbacGlobalEpoch: jest.fn(),
    };
});

const mockReadRbacGlobalEpoch = cacheStoresFactory.readRbacGlobalEpoch as jest.MockedFunction<
    typeof cacheStoresFactory.readRbacGlobalEpoch
>;
const mockIncrementRbacGlobalEpoch = cacheStoresFactory.incrementRbacGlobalEpoch as jest.MockedFunction<
    typeof cacheStoresFactory.incrementRbacGlobalEpoch
>;

function cached(permissions: string[], epoch = 0) {
    return { epoch, permissions };
}

function mockRedisConfigured(config: { get: jest.Mock }) {
    config.get.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'REDIS_HOST') return 'redis';
        if (key === 'RBAC_CACHE_TTL') return 300;
        return defaultValue;
    });
}

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
            get: jest.fn((key: string, defaultValue?: unknown) => {
                if (key === 'RBAC_CACHE_TTL') return 300;
                return defaultValue;
            }),
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
        mockReadRbacGlobalEpoch.mockReset();
        mockIncrementRbacGlobalEpoch.mockReset();
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

            mockCacheManager.get.mockResolvedValue(null);

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

            mockCacheManager.get.mockResolvedValue(cached(['test:view']));

            const result = await service.checkPermissions(roleId, requiredPermissions);
            expect(result).toBe(false);
        });

        it('should use cached permissions when epoch matches', async () => {
            const roleId = 'role-123';
            mockCacheManager.get.mockImplementation(async (key: string) => {
                if (key === 'rbac:role:role-123:permissions') {
                    return cached(['test:view']);
                }
                return null;
            });

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

        it('refetches when cached epoch is stale', async () => {
            mockCacheManager.get.mockImplementation(async (key: string) => {
                if (key === 'rbac:role:role-123:permissions') {
                    return cached(['stale:view'], 0);
                }
                return null;
            });
            mockRedisConfigured(mockConfigService);
            mockReadRbacGlobalEpoch.mockResolvedValue(1);

            mockRepository.find.mockResolvedValue([
                { permission: { action: 'view', feature: { key: 'test' } } },
            ]);

            const result = await service.getPermissionsForRole('role-123');
            expect(result).toEqual(['test:view']);
            expect(mockRepository.find).toHaveBeenCalled();
            expect(mockReadRbacGlobalEpoch).toHaveBeenCalled();
            expect(mockCacheManager.get).not.toHaveBeenCalledWith('rbac:global:epoch', expect.anything());
        });
    });

    describe('invalidateRoleCache', () => {
        it('bumps epoch via Redis INCR and clears local tracking', async () => {
            mockRedisConfigured(mockConfigService);
            mockIncrementRbacGlobalEpoch.mockResolvedValue(3);

            await service.invalidateRoleCache('role-123');

            expect(mockIncrementRbacGlobalEpoch).toHaveBeenCalled();
            expect(mockCacheManager.set).not.toHaveBeenCalledWith('rbac:global:epoch', expect.anything(), expect.anything());
        });
    });

    describe('invalidateAllRoles', () => {
        it('bumps epoch via Redis INCR after roles were cached locally', async () => {
            mockRedisConfigured(mockConfigService);
            mockReadRbacGlobalEpoch.mockResolvedValue(0);
            mockIncrementRbacGlobalEpoch.mockResolvedValue(1);
            mockCacheManager.get.mockResolvedValue(null);
            mockRepository.find.mockResolvedValue([
                { permission: { action: 'view', feature: { key: 'test' } } },
            ]);

            await service.getPermissionsForRole('role-1');
            await service.getPermissionsForRole('role-2');

            await service.invalidateAllRoles();

            expect(mockIncrementRbacGlobalEpoch).toHaveBeenCalled();
        });

        it('should not throw when no role has been cached', async () => {
            await expect(service.invalidateAllRoles()).resolves.toBeUndefined();
        });

        it('does not cache stale data when a mutation invalidates during an in-flight fetch', async () => {
            let resolveFind: (v: any) => void = () => {};
            mockCacheManager.get.mockResolvedValue(null);
            mockRepository.find.mockReturnValue(
                new Promise((resolve) => { resolveFind = resolve; }),
            );

            const pending = service.getPermissionsForRole('role-x');
            await new Promise((resolve) => setImmediate(resolve));
            expect(mockRepository.find).toHaveBeenCalled();

            await service.invalidateAllRoles();

            resolveFind([{ permission: { action: 'view', feature: { key: 'test' } } }]);
            await pending;

            expect(mockCacheManager.set).not.toHaveBeenCalled();
        });
    });
});
