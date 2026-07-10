import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { Feature } from '../entities/feature.entity';
import { RbacService } from './rbac.service';

describe('FeatureService', () => {
    let service: FeatureService;
    let mockFeatureRepo: any;
    let mockRbacService: any;

    beforeEach(async () => {
        const mockQueryBuilder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        };

        mockFeatureRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
        };

        mockRbacService = {
            invalidateAllRoles: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FeatureService,
                { provide: getRepositoryToken(Feature), useValue: mockFeatureRepo },
                { provide: RbacService, useValue: mockRbacService },
            ],
        }).compile();

        service = module.get<FeatureService>(FeatureService);
    });

    it('should create feature ensuring unique key', async () => {
        const dto = { key: 'test', name: 'Test' };
        mockFeatureRepo.create.mockReturnValue(dto);
        mockFeatureRepo.save.mockResolvedValue({ id: '1', ...dto });

        const result = await service.create(dto);
        expect(result).toEqual({ id: '1', ...dto });
    });

    it('should fail on duplicate key', async () => {
        const error = new Error('Unique constraint');
        (error as any).code = '23505';

        mockFeatureRepo.save.mockRejectedValue(error);
        await expect(service.create({ key: 'test', name: 'Test' })).rejects.toThrow();
    });

    it('should calculate pagination correctly', async () => {
        const qb = mockFeatureRepo.createQueryBuilder();
        qb.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findAll({ page: 2, limit: 10 });

        expect(qb.skip).toHaveBeenCalledWith(10);
        expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('should throw error when deleting feature with dependencies', async () => {
        const error = new Error('FK violation');
        (error as any).code = '23503';

        mockFeatureRepo.delete.mockRejectedValue(error);
        await expect(service.remove('1')).rejects.toThrow();
    });

    it('should invalidate all role caches after updating a feature', async () => {
        mockFeatureRepo.update.mockResolvedValue({ affected: 1 });
        mockFeatureRepo.findOne.mockResolvedValue({ id: '1', key: 'test' });

        await service.update('1', { name: 'Updated' });

        expect(mockRbacService.invalidateAllRoles).toHaveBeenCalledTimes(1);
    });

    it('should not invalidate caches when feature update targets a missing feature', async () => {
        mockFeatureRepo.update.mockResolvedValue({ affected: 0 });

        await expect(service.update('1', { name: 'Updated' })).rejects.toThrow();

        expect(mockRbacService.invalidateAllRoles).not.toHaveBeenCalled();
    });

    it('should invalidate all role caches after removing a feature', async () => {
        mockFeatureRepo.delete.mockResolvedValue({ affected: 1 });

        await service.remove('1');

        expect(mockRbacService.invalidateAllRoles).toHaveBeenCalledTimes(1);
    });

    it('should not invalidate caches when feature removal targets a missing feature', async () => {
        mockFeatureRepo.delete.mockResolvedValue({ affected: 0 });

        await expect(service.remove('missing')).rejects.toThrow(NotFoundException);

        expect(mockRbacService.invalidateAllRoles).not.toHaveBeenCalled();
    });

    it('should not invalidate caches when feature removal fails with FK violation', async () => {
        const error = new Error('FK violation');
        (error as any).code = '23503';

        mockFeatureRepo.delete.mockRejectedValue(error);

        await expect(service.remove('1')).rejects.toThrow();

        expect(mockRbacService.invalidateAllRoles).not.toHaveBeenCalled();
    });
});
