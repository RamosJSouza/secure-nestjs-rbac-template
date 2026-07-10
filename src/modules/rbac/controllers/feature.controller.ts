import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiNoContentResponse,
    ApiBadRequestResponse,
    ApiNotFoundResponse,
    ApiConflictResponse,
} from '@nestjs/swagger';
import { FeatureService } from '../services/feature.service';
import { CreateFeatureDto, UpdateFeatureDto, QueryFeatureDto, FeatureResponseDto, PaginatedFeatureResponseDto } from '../dto/feature.dto';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RbacEndpoint } from '../decorators/rbac-endpoint.decorator';

@ApiTags('Features')
@ApiBearerAuth()
@Controller('features')
@UseGuards(PermissionGuard)
export class FeatureController {
    constructor(private readonly featureService: FeatureService) { }

    @Post()
    @RbacEndpoint({
        permission: 'rbac:create',
        summary: 'Create a new feature',
        description: 'Creates a new feature module. Requires rbac:create permission.',
    })
    @ApiCreatedResponse({ description: 'Feature created successfully', type: FeatureResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiConflictResponse({ description: 'Feature key already exists' })
    create(@Body() dto: CreateFeatureDto) {
        return this.featureService.create(dto);
    }

    @Get()
    @RbacEndpoint({
        permission: 'rbac:view',
        summary: 'List all features',
        description: 'Returns paginated feature metadata without nested permissions. Use GET /features/:id for permissions.',
    })
    @ApiOkResponse({ description: 'Paginated list of features', type: PaginatedFeatureResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid query parameters' })
    findAll(@Query() query: QueryFeatureDto) {
        return this.featureService.findAll(query);
    }

    @Get(':id')
    @RbacEndpoint({
        permission: 'rbac:view',
        summary: 'Get feature by ID',
        description: 'Returns a single feature by UUID.',
    })
    @ApiOkResponse({ description: 'Feature details', type: FeatureResponseDto })
    @ApiNotFoundResponse({ description: 'Feature not found' })
    findOne(@Param('id') id: string) {
        return this.featureService.findOne(id);
    }

    @Put(':id')
    @RbacEndpoint({
        permission: 'rbac:edit',
        summary: 'Update feature',
        description: 'Updates an existing feature. Requires rbac:edit permission.',
    })
    @ApiOkResponse({ description: 'Feature updated successfully', type: FeatureResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiNotFoundResponse({ description: 'Feature not found' })
    @ApiConflictResponse({ description: 'Feature key already exists' })
    update(@Param('id') id: string, @Body() dto: UpdateFeatureDto) {
        return this.featureService.update(id, dto);
    }

    @Delete(':id')
    @RbacEndpoint({
        permission: 'rbac:delete',
        summary: 'Delete feature',
        description: 'Deletes a feature. Fails if permissions exist for this feature.',
    })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse({ description: 'Feature deleted successfully' })
    @ApiNotFoundResponse({ description: 'Feature not found' })
    @ApiConflictResponse({ description: 'Cannot delete feature with existing permissions' })
    remove(@Param('id') id: string) {
        return this.featureService.remove(id);
    }
}
