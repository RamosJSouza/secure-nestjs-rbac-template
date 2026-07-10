import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feature } from '../entities/feature.entity';
import { CreateFeatureDto, UpdateFeatureDto, QueryFeatureDto } from '../dto/feature.dto';
import { RbacService } from './rbac.service';
import { handlePgConstraintError } from '@/common/utils/pg-constraint-error.util';
import { applyActiveFilter, applyPagination } from '@/common/utils/pagination-query.util';

@Injectable()
export class FeatureService {
    private readonly logger = new Logger(FeatureService.name);

    constructor(
        @InjectRepository(Feature)
        private featureRepository: Repository<Feature>,
        private rbacService: RbacService,
    ) {}

    async create(dto: CreateFeatureDto): Promise<Feature> {
        this.logger.debug(`Creating feature: ${dto.key}`);

        try {
            const feature = this.featureRepository.create(dto);
            return await this.featureRepository.save(feature);
        } catch (err) {
            handlePgConstraintError(err, {
                onUnique: () => {
                    throw new ConflictException(`Feature with key "${dto.key}" already exists`);
                },
            });
        }
    }

    async findAll(query: QueryFeatureDto = {}): Promise<{ data: Feature[]; total: number }> {
        const { search, isActive } = query;

        const qb = this.featureRepository.createQueryBuilder('feature');

        if (search) {
            qb.andWhere('feature.name ILIKE :search OR feature.key ILIKE :search', {
                search: `%${search}%`,
            });
        }

        applyActiveFilter(qb, 'feature', isActive);
        applyPagination(qb, query, { column: 'feature.createdAt', direction: 'DESC' });

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
            const result = await this.featureRepository.delete(id);
            if (result.affected === 0) {
                throw new NotFoundException(`Feature with ID "${id}" not found`);
            }
        } catch (err) {
            if (err instanceof NotFoundException) {
                throw err;
            }
            handlePgConstraintError(err, {
                onForeignKey: () => {
                    throw new ConflictException('Cannot delete feature with existing permissions assigned to roles');
                },
            });
        }

        await this.rbacService.invalidateAllRoles();
    }
}
