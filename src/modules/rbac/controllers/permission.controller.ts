import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PermissionService } from '../services/permission.service';
import { CreatePermissionDto, UpdatePermissionDto } from '../dto/permission.dto';
import { JwtAuthGuard } from '@/auth/strategy/jwt-auth.guard';
import { PermissionGuard, RequirePermissions } from '@/common/guards/permission.guard';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionController {
    constructor(private readonly permissionService: PermissionService) { }

    @Post()
    @RequirePermissions('rbac:create')
    @ApiOperation({ summary: 'Create a new permission' })
    @ApiResponse({ status: 201, description: 'Permission created successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 409, description: 'Conflict - Permission already exists on this feature' })
    create(@Body() dto: CreatePermissionDto) {
        return this.permissionService.create(dto);
    }

    @Get('feature/:featureId')
    @RequirePermissions('rbac:view')
    @ApiOperation({ summary: 'List permissions by feature' })
    @ApiResponse({ status: 200, description: 'List of permissions for the feature' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    findByFeature(@Param('featureId') featureId: string) {
        return this.permissionService.findByFeature(featureId);
    }

    @Get(':id')
    @RequirePermissions('rbac:view')
    @ApiOperation({ summary: 'Get permission by ID' })
    @ApiResponse({ status: 200, description: 'Permission details' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Permission not found' })
    findOne(@Param('id') id: string) {
        return this.permissionService.findOne(id);
    }

    @Put(':id')
    @RequirePermissions('rbac:edit')
    @ApiOperation({ summary: 'Update permission' })
    @ApiResponse({ status: 200, description: 'Permission updated successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Permission not found' })
    update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
        return this.permissionService.update(id, dto);
    }

    @Delete(':id')
    @RequirePermissions('rbac:delete')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete permission' })
    @ApiResponse({ status: 204, description: 'Permission deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Permission not found' })
    @ApiResponse({ status: 409, description: 'Conflict - Cannot delete permission assigned to roles' })
    remove(@Param('id') id: string) {
        return this.permissionService.remove(id);
    }
}
