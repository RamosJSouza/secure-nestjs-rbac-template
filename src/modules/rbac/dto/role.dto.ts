import { IsString, IsBoolean, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BasePaginationQueryDto } from '@/common/dto/base-pagination-query.dto';

export class CreateRoleDto {
    @ApiProperty({
        example: 'Sales Representative',
        description: 'Unique role name',
        required: true,
    })
    @IsString()
    name: string;

    @ApiPropertyOptional({
        example: 'Can manage sales pipeline and reports',
        description: 'Role description',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        default: true,
        example: true,
        description: 'Whether the role is active',
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class UpdateRoleDto {
    @ApiPropertyOptional({ example: 'Senior Sales Representative' })
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

export class AssignPermissionsDto {
    @ApiProperty({
        type: [String],
        example: ['uuid-permission-1', 'uuid-permission-2'],
        description: 'Array of permission UUIDs to assign to the role',
        required: true,
    })
    @IsArray()
    @IsUUID('4', { each: true })
    permissionIds: string[];
}

export class QueryRoleDto extends BasePaginationQueryDto {}

/** Response DTO for Role operations */
export class RoleResponseDto {
    @ApiProperty({ example: '31d45fbd-2b4b-4922-a653-7af171d3908d' })
    id: string;

    @ApiProperty({ example: 'Super Admin' })
    name: string;

    @ApiPropertyOptional({ example: 'Full system access' })
    description?: string;

    @ApiProperty({ example: true })
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

export class PaginatedRoleResponseDto {
    @ApiProperty({ type: [RoleResponseDto] })
    data: RoleResponseDto[];

    @ApiProperty({ example: 42 })
    total: number;
}
