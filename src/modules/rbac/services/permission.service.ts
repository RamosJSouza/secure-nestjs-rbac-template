import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { CreatePermissionDto, UpdatePermissionDto } from '../dto/permission.dto';
import { RbacService } from './rbac.service';
import { handlePgConstraintError } from '@/common/utils/pg-constraint-error.util';

@Injectable()
export class PermissionService {
    private readonly logger = new Logger(PermissionService.name);

    constructor(
        @InjectRepository(Permission)
        private permissionRepository: Repository<Permission>,
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

        if (!permission) {
            throw new NotFoundException(`Permission with ID "${id}" not found`);
        }

        return permission;
    }

    async update(id: string, dto: UpdatePermissionDto): Promise<Permission> {
        const result = await this.permissionRepository.update(id, dto);

        if (result.affected === 0) {
            throw new NotFoundException(`Permission with ID "${id}" not found`);
        }

        await this.rbacService.invalidateAllRoles();
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        try {
            const result = await this.permissionRepository.delete(id);
            if (result.affected === 0) {
                throw new NotFoundException(`Permission with ID "${id}" not found`);
            }
        } catch (err) {
            if (err instanceof NotFoundException) {
                throw err;
            }
            handlePgConstraintError(err, {
                onForeignKey: () => {
                    throw new ConflictException('Cannot delete permission that is assigned to roles. Revoke it first.');
                },
            });
        }

        await this.rbacService.invalidateAllRoles();
    }
}
