import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BasePaginationQueryDto } from '@/common/dto/base-pagination-query.dto';

export class CreateFeatureDto {
    @ApiProperty({
        example: 'financial_dashboard',
        description: 'Unique feature key (snake_case)',
        required: true,
    })
    @IsString()
    key: string;

    @ApiProperty({
        example: 'Dashboard Financeiro',
        description: 'Human-readable feature name',
        required: true,
    })
    @IsString()
    name: string;

    @ApiPropertyOptional({
        example: 'Dashboard com métricas financeiras',
        description: 'Feature description',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        default: true,
        example: true,
        description: 'Whether the feature is active',
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class UpdateFeatureDto {
    @ApiPropertyOptional({ example: 'financial_dashboard_v2' })
    @IsOptional()
    @IsString()
    key?: string;

    @ApiPropertyOptional({ example: 'Dashboard Financeiro (v2)' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ example: 'Updated description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class QueryFeatureDto extends BasePaginationQueryDto {}

/** Response DTO for Feature operations */
export class FeatureResponseDto {
    @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
    id: string;

    @ApiProperty({ example: 'financial_dashboard' })
    key: string;

    @ApiProperty({ example: 'Dashboard Financeiro' })
    name: string;

    @ApiPropertyOptional({ example: 'Dashboard com métricas financeiras' })
    description?: string;

    @ApiProperty({ example: true })
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

export class PaginatedFeatureResponseDto {
    @ApiProperty({ type: [FeatureResponseDto] })
    data: FeatureResponseDto[];

    @ApiProperty({ example: 42 })
    total: number;
}
