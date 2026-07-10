import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { CreatePermissionDto, UpdatePermissionDto } from '../dto/permission.dto';
import { RbacService } from './rbac.service';
import { handlePgConstraintError } from '@/common/utils/pg-constraint-error.util';
import { assertFound, ensureAffected, safeDelete } from '../utils/rbac-crud.util';
import { fetchRoleIdsForPermission } from '../repositories/role-permission.query';

@Injectable()
export class PermissionService {
    private readonly logger = new Logger(PermissionService.name);

    constructor(
        @InjectRepository(Permission)
        private permissionRepository: Repository<Permission>,
        @InjectRepository(RolePermission)
        private rolePermissionRepository: Repository<RolePermission>,
        private rbacService: RbacService,
    ) { }

    async create(dto: CreatePermissionDto): Promise<Permission> {
        this.logger.debug(`Creating permission: ${dto.featureId}:${dto.action}`);
        try {
            const permission = this.permissionRepository.create(dto);
            return await this.permissionRepository.save(permission);
        } catch (err) {
            handlePgConstraintError(err, {
                onUnique: () => {
                    throw new ConflictException(`Permission "${dto.action}" for this feature already exists`);
                },
            });
        }
    }

    async findByFeature(featureId: string): Promise<Permission[]> {
        return this.permissionRepository.find({
            where: { featureId },
            relations: ['feature'],
            order: { action: 'ASC' },
        });
    }

    async findOne(id: string): Promise<Permission> {
        const permission = await this.permissionRepository.findOne({
            where: { id },
            relations: ['feature'],
        });

        return assertFound(permission, 'Permission', id);
    }

    async update(id: string, dto: UpdatePermissionDto): Promise<Permission> {
        const result = await this.permissionRepository.update(id, dto);
        ensureAffected(result, 'Permission', id);

        const roleIds = await fetchRoleIdsForPermission(this.rolePermissionRepository, id);
        await this.rbacService.invalidateRoles(roleIds);
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        const roleIds = await fetchRoleIdsForPermission(this.rolePermissionRepository, id);
        await safeDelete(
            this.permissionRepository,
            id,
            'Permission',
            'Cannot delete permission that is assigned to roles. Revoke it first.',
        );
        await this.rbacService.invalidateRoles(roleIds);
    }
}
