import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermissionService } from './permission.service';
import { Permission } from '../entities/permission.entity';
import { RbacService } from './rbac.service';

describe('PermissionService', () => {
    let service: PermissionService;
    let mockPermissionRepo: any;
    let mockDataSource: any;
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

        mockDataSource = {
            createQueryRunner: jest.fn(),
        };

        mockRbacService = {
            invalidateAllRoles: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PermissionService,
                { provide: getRepositoryToken(Permission), useValue: mockPermissionRepo },
                { provide: DataSource, useValue: mockDataSource },
                { provide: RbacService, useValue: mockRbacService },
            ],
        }).compile();

        service = module.get<PermissionService>(PermissionService);
    });

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

    it('should invalidate all role caches after updating a permission', async () => {
        mockPermissionRepo.update.mockResolvedValue({ affected: 1 });
        mockPermissionRepo.findOne.mockResolvedValue({ id: '1', action: 'view' });

        await service.update('1', { name: 'Updated' });

        expect(mockRbacService.invalidateAllRoles).toHaveBeenCalledTimes(1);
    });

    it('should invalidate all role caches after removing a permission', async () => {
        mockPermissionRepo.delete.mockResolvedValue(undefined);

        await service.remove('1');

        expect(mockRbacService.invalidateAllRoles).toHaveBeenCalledTimes(1);
    });

    it('should not invalidate caches when permission removal fails with FK violation', async () => {
        const error = new Error('FK violation');
        (error as any).code = '23503';

        mockPermissionRepo.delete.mockRejectedValue(error);

        await expect(service.remove('1')).rejects.toThrow();

        expect(mockRbacService.invalidateAllRoles).not.toHaveBeenCalled();
    });
});
