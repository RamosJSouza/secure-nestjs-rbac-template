import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { CreatePermissionDto, UpdatePermissionDto } from '../dto/permission.dto';

@Injectable()
export class PermissionService {
    private readonly logger = new Logger(PermissionService.name);

    constructor(
        @InjectRepository(Permission)
        private permissionRepository: Repository<Permission>,
        private dataSource: DataSource,
    ) { }

    async create(dto: CreatePermissionDto): Promise<Permission> {
        this.logger.debug(`Creating permission: ${dto.featureId}:${dto.action}`);
        try {
            const permission = this.permissionRepository.create(dto);
            return await this.permissionRepository.save(permission);
        } catch (err) {
            if (err.code === '23505') {
                throw new ConflictException(`Permission "${dto.action}" for this feature already exists`);
            }
            throw err;
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
        await this.permissionRepository.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        try {
            await this.permissionRepository.delete(id);
        } catch (err) {
            if (err.code === '23503') {
                throw new ConflictException('Cannot delete permission that is assigned to roles. Revoke it first.');
            }
            throw err;
        }
    }
}
