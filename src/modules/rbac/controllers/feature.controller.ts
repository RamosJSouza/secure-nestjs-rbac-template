import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiNoContentResponse,
    ApiBadRequestResponse,
    ApiUnauthorizedResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiConflictResponse,
} from '@nestjs/swagger';
import { FeatureService } from '../services/feature.service';
import { CreateFeatureDto, UpdateFeatureDto, QueryFeatureDto, FeatureResponseDto, PaginatedFeatureResponseDto } from '../dto/feature.dto';
import { PermissionGuard, RequirePermissions } from '@/common/guards/permission.guard';

@ApiTags('Features')
@ApiBearerAuth()
@Controller('features')
@UseGuards(PermissionGuard)
export class FeatureController {
    constructor(private readonly featureService: FeatureService) { }

    @Post()
    @RequirePermissions('rbac:create')
    @ApiOperation({
        summary: 'Create a new feature',
        description: 'Creates a new feature module. Requires rbac:create permission.',
    })
    @ApiCreatedResponse({ description: 'Feature created successfully', type: FeatureResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:create permission' })
    @ApiConflictResponse({ description: 'Feature key already exists' })
    create(@Body() dto: CreateFeatureDto) {
        return this.featureService.create(dto);
    }

    @Get()
    @RequirePermissions('rbac:view')
    @ApiOperation({
        summary: 'List all features',
        description: 'Returns paginated feature metadata without nested permissions. Use GET /features/:id for permissions.',
    })
    @ApiOkResponse({ description: 'Paginated list of features', type: PaginatedFeatureResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid query parameters' })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:view permission' })
    findAll(@Query() query: QueryFeatureDto) {
        return this.featureService.findAll(query);
    }

    @Get(':id')
    @RequirePermissions('rbac:view')
    @ApiOperation({
        summary: 'Get feature by ID',
        description: 'Returns a single feature by UUID.',
    })
    @ApiOkResponse({ description: 'Feature details', type: FeatureResponseDto })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:view permission' })
    @ApiNotFoundResponse({ description: 'Feature not found' })
    findOne(@Param('id') id: string) {
        return this.featureService.findOne(id);
    }

    @Put(':id')
    @RequirePermissions('rbac:edit')
    @ApiOperation({
        summary: 'Update feature',
        description: 'Updates an existing feature. Requires rbac:edit permission.',
    })
    @ApiOkResponse({ description: 'Feature updated successfully', type: FeatureResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:edit permission' })
    @ApiNotFoundResponse({ description: 'Feature not found' })
    @ApiConflictResponse({ description: 'Feature key already exists' })
    update(@Param('id') id: string, @Body() dto: UpdateFeatureDto) {
        return this.featureService.update(id, dto);
    }

    @Delete(':id')
    @RequirePermissions('rbac:delete')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Delete feature',
        description: 'Deletes a feature. Fails if permissions exist for this feature.',
    })
    @ApiNoContentResponse({ description: 'Feature deleted successfully' })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:delete permission' })
    @ApiNotFoundResponse({ description: 'Feature not found' })
    @ApiConflictResponse({ description: 'Cannot delete feature with existing permissions' })
    remove(@Param('id') id: string) {
        return this.featureService.remove(id);
    }
}
