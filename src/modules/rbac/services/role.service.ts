import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, QueryRoleDto } from '../dto/role.dto';
import { RbacService } from './rbac.service';
import { User } from '../entities/user.entity';
import { handlePgConstraintError } from '@/common/utils/pg-constraint-error.util';
import { applyActiveFilter, applyPagination } from '@/common/utils/pagination-query.util';
import { RequestContext } from '@/logger/request-context';
import { assertFound } from '../utils/rbac-crud.util';

@Injectable()
export class RoleService {
    private readonly logger = new Logger(RoleService.name);

    constructor(
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private rbacService: RbacService,
        private dataSource: DataSource,
    ) {}

    async create(dto: CreateRoleDto): Promise<Role> {
        const existing = await this.roleRepository.findOne({
            where: { name: dto.name },
        });

        if (existing) {
            throw new ConflictException(`Role "${dto.name}" already exists`);
        }

        try {
            const role = this.roleRepository.create(dto);
            const savedRole = await this.roleRepository.save(role);
            this.logger.log(`Created new role: ${savedRole.id}`);
            return savedRole;
        } catch (err) {
            handlePgConstraintError(err, {
                onUnique: () => {
                    throw new ConflictException(`Role "${dto.name}" already exists`);
                },
            });
        }
    }

    async findAll(query: QueryRoleDto = {}): Promise<{ data: Role[]; total: number }> {
        const { search, isActive } = query;

        const qb = this.roleRepository.createQueryBuilder('role');

        if (search) {
            qb.andWhere('role.name ILIKE :search', { search: `%${search}%` });
        }

        applyActiveFilter(qb, 'role', isActive);
        applyPagination(qb, query, { column: 'role.name', direction: 'ASC' });

        const [data, total] = await qb.getManyAndCount();
        return { data, total };
    }

    async findOne(id: string): Promise<Role> {
        const role = await this.roleRepository
            .createQueryBuilder('role')
            .leftJoinAndSelect('role.rolePermissions', 'rp')
            .leftJoinAndSelect('rp.permission', 'p')
            .leftJoinAndSelect('p.feature', 'f')
            .where('role.id = :id', { id })
            .getOne();

        return assertFound(role, 'Role', id);
    }

    async update(id: string, dto: UpdateRoleDto): Promise<Role> {
        const role = await this.findOne(id);

        if (dto.name && dto.name !== role.name) {
            const existing = await this.roleRepository.findOne({
                where: { name: dto.name },
                select: { id: true }
            });

            if (existing) {
                throw new ConflictException(`Role with name "${dto.name}" already exists`);
            }
        }

        Object.assign(role, dto);

        try {
            const updated = await this.roleRepository.save(role);

            if (dto.isActive !== undefined) {
                await this.rbacService.invalidateRoleCache(id);
            }

            this.logger.log(`Updated role ${id}`);
            return updated;
        } catch (err) {
            handlePgConstraintError(err, {
                onUnique: () => {
                    throw new ConflictException(`Role with name "${dto.name ?? role.name}" already exists`);
                },
            });
        }
    }

    async remove(id: string): Promise<void> {
        const exists = await this.roleRepository.exists({ where: { id } });
        if (!exists) {
            throw new NotFoundException(`Role with ID "${id}" not found`);
        }

        const userCount = await this.userRepository.count({ where: { roleId: id } });

        if (userCount > 0) {
            this.logger.warn(`Attempt to delete role ${id} with ${userCount} users`);
            throw new ConflictException(`Cannot delete role with ${userCount} users assigned`);
        }

        await this.roleRepository.delete(id);
        await this.rbacService.invalidateRoleCache(id);
        this.logger.log(`Deleted role ${id}`);
    }

    async assignPermissions(roleId: string, dto: AssignPermissionsDto): Promise<{ permissionIds: string[] }> {
        const exists = await this.roleRepository.exists({ where: { id: roleId } });
        if (!exists) {
            throw new NotFoundException(`Role with ID "${roleId}" not found`);
        }

        const uniquePermissions = await this.dataSource.transaction('SERIALIZABLE', async (em) => {
            await em.delete(RolePermission, { roleId });

            const permissionIds = [...new Set(dto.permissionIds)];

            await em.save(
                RolePermission,
                permissionIds.map((permissionId) =>
                    em.create(RolePermission, { roleId, permissionId }),
                ),
            );

            return permissionIds;
        });

        await this.rbacService.invalidateRoleCache(roleId);

        const actor = RequestContext.getUserId() ?? 'system';
        this.logger.log(`Assigned ${uniquePermissions.length} permissions to role ${roleId} by user ${actor}`);

        return { permissionIds: uniquePermissions };
    }
}
