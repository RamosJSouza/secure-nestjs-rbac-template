import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Feature } from '../entities/feature.entity';
import { CreateFeatureDto, UpdateFeatureDto, QueryFeatureDto } from '../dto/feature.dto';
import { RbacService } from './rbac.service';

@Injectable()
export class FeatureService {
    private readonly logger = new Logger(FeatureService.name);

    constructor(
        @InjectRepository(Feature)
        private featureRepository: Repository<Feature>,
        private rbacService: RbacService,
        private dataSource: DataSource,
    ) { }

    async create(dto: CreateFeatureDto): Promise<Feature> {
        this.logger.debug(`Creating feature: ${dto.key}`);

        try {
            const feature = this.featureRepository.create(dto);
            return await this.featureRepository.save(feature);
        } catch (err) {
            if (err.code === '23505') {
                throw new ConflictException(`Feature with key "${dto.key}" already exists`);
            }
            throw err;
        }
    }

    async findAll(query: QueryFeatureDto): Promise<{ data: Feature[]; total: number }> {
        const { page = 1, limit = 10, search, isActive } = query;

        const qb = this.featureRepository.createQueryBuilder('feature');

        if (search) {
            qb.where('feature.name ILIKE :search OR feature.key ILIKE :search', {
                search: `%${search}%`,
            });
        }

        if (isActive !== undefined) {
            qb.andWhere('feature.isActive = :isActive', { isActive });
        }

        qb.leftJoinAndSelect('feature.permissions', 'permissions');
        qb.orderBy('feature.createdAt', 'DESC');

        const offset = (page - 1) * limit;
        qb.skip(offset).take(limit);

        const [data, total] = await qb.getManyAndCount();

        return { data, total };
    }

    async findOne(id: string): Promise<Feature> {
        const feature = await this.featureRepository.findOne({
            where: { id },
            relations: ['permissions'],
        });

        if (!feature) {
            throw new NotFoundException(`Feature with ID "${id}" not found`);
        }

        return feature;
    }

    async update(id: string, dto: UpdateFeatureDto): Promise<Feature> {
        const result = await this.featureRepository.update(id, dto);

        if (result.affected === 0) {
            throw new NotFoundException(`Feature ${id} not found`);
        }

        await this.rbacService.invalidateAllRoles();
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        try {
            await this.featureRepository.delete(id);
        } catch (err) {
            if (err.code === '23503') {
                throw new ConflictException('Cannot delete feature with existing permissions assigned to roles');
            }
            throw err;
        }

        await this.rbacService.invalidateAllRoles();
    }
}
