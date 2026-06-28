import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from '../dto/role.dto';
import { RbacService } from './rbac.service';
import { User } from '../entities/user.entity';

@Injectable()
export class RoleService {
    private readonly logger = new Logger(RoleService.name);

    constructor(
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
        @InjectRepository(RolePermission)
        private rolePermissionRepository: Repository<RolePermission>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private rbacService: RbacService,
        private dataSource: DataSource,
    ) { }

    async create(dto: CreateRoleDto): Promise<Role> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const existing = await queryRunner.manager.findOne(Role, {
                where: { name: dto.name },
            });

            if (existing) {
                throw new ConflictException(`Role "${dto.name}" already exists`);
            }

            const role = queryRunner.manager.create(Role, dto);
            const savedRole = await queryRunner.manager.save(Role, role);

            await queryRunner.commitTransaction();
            this.logger.log(`Created new role: ${savedRole.id}`);
            return savedRole;
        } catch (err) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Failed to create role: ${err.message}`, err.stack);
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async findAll(): Promise<Role[]> {
        return this.roleRepository.find({
            relations: ['rolePermissions', 'rolePermissions.permission', 'rolePermissions.permission.feature'],
            order: { name: 'ASC' },
            cache: true
        });
    }

    async findOne(id: string): Promise<Role> {
        const role = await this.roleRepository.findOne({
            where: { id },
            relations: ['rolePermissions', 'rolePermissions.permission', 'rolePermissions.permission.feature'],
        });

        if (!role) {
            throw new NotFoundException(`Role with ID "${id}" not found`);
        }

        return role;
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
        const updated = await this.roleRepository.save(role);

        if (dto.isActive !== undefined) {
            await this.rbacService.invalidateRoleCache(id);
        }

        this.logger.log(`Updated role ${id}`);
        return updated;
    }

    async remove(id: string): Promise<void> {
        const role = await this.findOne(id);

        const userCount = await this.userRepository.count({ where: { roleId: id } });

        if (userCount > 0) {
            this.logger.warn(`Attempt to delete role ${id} with ${userCount} users`);
            throw new ConflictException(`Cannot delete role with ${userCount} users assigned`);
        }

        await this.roleRepository.remove(role);
        await this.rbacService.invalidateRoleCache(id);
        this.logger.log(`Deleted role ${id}`);
    }

    async assignPermissions(roleId: string, dto: AssignPermissionsDto, currentUserId?: string): Promise<void> {
        const role = await this.findOne(roleId);

        if (role.name === 'Super Admin') {
            // In a real system, you might restrict this even further
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction('SERIALIZABLE');

        try {
            await queryRunner.manager.delete(RolePermission, { roleId });

            const uniquePermissions = [...new Set(dto.permissionIds)];

            const newPermissions = uniquePermissions.map(permissionId =>
                queryRunner.manager.create(RolePermission, {
                    roleId,
                    permissionId,
                    granted: true
                })
            );

            await queryRunner.manager.save(RolePermission, newPermissions);

            await queryRunner.commitTransaction();

            await this.rbacService.invalidateRoleCache(roleId);

            this.logger.log(`Assigned ${newPermissions.length} permissions to role ${roleId} by user ${currentUserId || 'system'}`);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Failed to assign permissions: ${err.message}`, err.stack);
            throw err;
        } finally {
            await queryRunner.release();
        }
    }
}
