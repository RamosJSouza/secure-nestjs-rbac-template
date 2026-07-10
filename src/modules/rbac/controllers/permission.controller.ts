import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
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
import { PermissionService } from '../services/permission.service';
import { CreatePermissionDto, UpdatePermissionDto } from '../dto/permission.dto';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RbacEndpoint } from '../decorators/rbac-endpoint.decorator';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(PermissionGuard)
export class PermissionController {
    constructor(private readonly permissionService: PermissionService) { }

    @Post()
    @RbacEndpoint({
        permission: 'rbac:create',
        summary: 'Create a new permission',
        description: 'Creates a new permission scoped to a feature. Requires rbac:create permission.',
    })
    @ApiCreatedResponse({ description: 'Permission created successfully' })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiConflictResponse({ description: 'Permission already exists on this feature' })
    create(@Body() dto: CreatePermissionDto) {
        return this.permissionService.create(dto);
    }

    @Get('feature/:featureId')
    @RbacEndpoint({
        permission: 'rbac:view',
        summary: 'List permissions by feature',
        description: 'Returns all permissions defined for a given feature.',
    })
    @ApiOkResponse({ description: 'List of permissions for the feature' })
    findByFeature(@Param('featureId') featureId: string) {
        return this.permissionService.findByFeature(featureId);
    }

    @Get(':id')
    @RbacEndpoint({
        permission: 'rbac:view',
        summary: 'Get permission by ID',
        description: 'Returns a single permission by UUID with its feature.',
    })
    @ApiOkResponse({ description: 'Permission details' })
    @ApiNotFoundResponse({ description: 'Permission not found' })
    findOne(@Param('id') id: string) {
        return this.permissionService.findOne(id);
    }

    @Put(':id')
    @RbacEndpoint({
        permission: 'rbac:edit',
        summary: 'Update permission',
        description: 'Updates an existing permission. Requires rbac:edit permission.',
    })
    @ApiOkResponse({ description: 'Permission updated successfully' })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiNotFoundResponse({ description: 'Permission not found' })
    update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
        return this.permissionService.update(id, dto);
    }

    @Delete(':id')
    @RbacEndpoint({
        permission: 'rbac:delete',
        summary: 'Delete permission',
        description: 'Deletes a permission. Fails if the permission is assigned to any role.',
    })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse({ description: 'Permission deleted successfully' })
    @ApiNotFoundResponse({ description: 'Permission not found' })
    @ApiConflictResponse({ description: 'Cannot delete permission assigned to roles' })
    remove(@Param('id') id: string) {
        return this.permissionService.remove(id);
    }
}
