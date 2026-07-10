import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { RoleService } from './role.service';
import { RbacService } from './rbac.service';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { User } from '../entities/user.entity';
describe('RoleService', () => {
    let service: RoleService;
    let mockRoleRepo: any;
    let mockUserRepo: any;
    let mockRbacService: any;
    let mockDataSource: any;

    beforeEach(async () => {
        mockRoleRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            exists: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
        };

        mockUserRepo = {
            count: jest.fn(),
        };

        mockRbacService = {
            invalidateRoleCache: jest.fn(),
        };

        mockDataSource = {
            transaction: jest.fn().mockImplementation(async (_isolation, cb) => {
                const em = {
                    delete: jest.fn(),
                    create: jest.fn((_, data) => data),
                    save: jest.fn(),
                };
                return cb(em);
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoleService,
                { provide: getRepositoryToken(Role), useValue: mockRoleRepo },
                { provide: getRepositoryToken(User), useValue: mockUserRepo },
                { provide: RbacService, useValue: mockRbacService },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<RoleService>(RoleService);
    });

    it('should create a role without a transaction', async () => {
        const dto = { name: 'Admin' };
        mockRoleRepo.findOne.mockResolvedValue(null);
        mockRoleRepo.create.mockReturnValue(dto);
        mockRoleRepo.save.mockResolvedValue({ id: '1', ...dto });

        const result = await service.create(dto);
        expect(result).toEqual({ id: '1', name: 'Admin' });
        expect(mockDataSource.transaction).not.toHaveBeenCalled();
        expect(mockRoleRepo.save).toHaveBeenCalled();
    });

    it('should prevent creating duplicate roles', async () => {
        mockRoleRepo.findOne.mockResolvedValue({ name: 'Admin' });

        await expect(service.create({ name: 'Admin' })).rejects.toThrow();
    });

    it('maps unique violation on save to ConflictException', async () => {
        mockRoleRepo.findOne.mockResolvedValue(null);
        mockRoleRepo.create.mockReturnValue({ name: 'Admin' });
        mockRoleRepo.save.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));

        await expect(service.create({ name: 'Admin' })).rejects.toThrow(ConflictException);
    });

    it('should assign permissions transactionally', async () => {
        mockRoleRepo.exists.mockResolvedValue(true);
        let transactionalEm: { delete: jest.Mock; create: jest.Mock; save: jest.Mock };
        mockDataSource.transaction.mockImplementation(async (_isolation, cb) => {
            transactionalEm = {
                delete: jest.fn(),
                create: jest.fn((_, data) => data),
                save: jest.fn(),
            };
            return cb(transactionalEm);
        });

        await service.assignPermissions('role-1', { permissionIds: ['p1', 'p2'] });

        expect(mockRoleRepo.exists).toHaveBeenCalledWith({ where: { id: 'role-1' } });
        expect(mockDataSource.transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.any(Function));
        expect(transactionalEm!.delete).toHaveBeenCalledWith(RolePermission, { roleId: 'role-1' });
        expect(transactionalEm!.save).toHaveBeenCalled();
        expect(mockRbacService.invalidateRoleCache).toHaveBeenCalledWith('role-1');
    });

    it('should not delete role if users are assigned', async () => {
        mockRoleRepo.exists.mockResolvedValue(true);
        mockUserRepo.count.mockResolvedValue(5);

        await expect(service.remove('role-1')).rejects.toThrow();
    });

    it('findAll returns paginated data without relation joins', async () => {
        const qb = {
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'r1' }], 1]),
        };
        mockRoleRepo.createQueryBuilder.mockReturnValue(qb);

        const result = await service.findAll({ page: 1, limit: 10 });

        expect(result).toEqual({ data: [{ id: 'r1' }], total: 1 });
        expect(qb.skip).toHaveBeenCalledWith(0);
        expect(qb.take).toHaveBeenCalledWith(10);
    });
});
