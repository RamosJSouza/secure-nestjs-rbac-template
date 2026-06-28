import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
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
import { RoleService } from '../services/role.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, RoleResponseDto } from '../dto/role.dto';
import { JwtAuthGuard } from '@/auth/strategy/jwt-auth.guard';
import { PermissionGuard, RequirePermissions } from '@/common/guards/permission.guard';
import { Auditable } from '@/modules/audit/decorators/auditable.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RoleController {
    constructor(private readonly roleService: RoleService) { }

    @Post()
    @RequirePermissions('rbac:create')
    @Auditable('role.create', 'Role')
    @ApiOperation({
        summary: 'Create a new role',
        description: 'Creates a new role. Requires rbac:create permission.',
    })
    @ApiCreatedResponse({ description: 'Role created successfully', type: RoleResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:create permission' })
    @ApiConflictResponse({ description: 'Role name already exists' })
    create(@Body() dto: CreateRoleDto) {
        return this.roleService.create(dto);
    }

    @Get()
    @RequirePermissions('rbac:view')
    @ApiOperation({
        summary: 'List all roles',
        description: 'Returns all roles with their permissions. Requires rbac:view permission.',
    })
    @ApiOkResponse({ description: 'List of roles', type: [RoleResponseDto] })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:view permission' })
    findAll() {
        return this.roleService.findAll();
    }

    @Get(':id')
    @RequirePermissions('rbac:view')
    @ApiOperation({
        summary: 'Get role by ID',
        description: 'Returns a single role by UUID with its permissions.',
    })
    @ApiOkResponse({ description: 'Role details', type: RoleResponseDto })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:view permission' })
    @ApiNotFoundResponse({ description: 'Role not found' })
    findOne(@Param('id') id: string) {
        return this.roleService.findOne(id);
    }

    @Put(':id')
    @RequirePermissions('rbac:edit')
    @Auditable('role.update', 'Role', { entityIdParam: 0 })
    @ApiOperation({
        summary: 'Update role',
        description: 'Updates an existing role. Requires rbac:edit permission.',
    })
    @ApiOkResponse({ description: 'Role updated successfully', type: RoleResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:edit permission' })
    @ApiNotFoundResponse({ description: 'Role not found' })
    @ApiConflictResponse({ description: 'Role name already exists' })
    update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
        return this.roleService.update(id, dto);
    }

    @Delete(':id')
    @RequirePermissions('rbac:delete')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Auditable('role.delete', 'Role', { entityIdParam: 0 })
    @ApiOperation({
        summary: 'Delete role',
        description: 'Deletes a role. Fails if users are assigned to the role.',
    })
    @ApiNoContentResponse({ description: 'Role deleted successfully' })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:delete permission' })
    @ApiNotFoundResponse({ description: 'Role not found' })
    @ApiConflictResponse({ description: 'Cannot delete role with assigned users' })
    remove(@Param('id') id: string) {
        return this.roleService.remove(id);
    }

    @Post(':id/permissions')
    @RequirePermissions('rbac:assign_permissions')
    @HttpCode(HttpStatus.OK)
    @Auditable('role.assign_permissions', 'Role', { entityIdParam: 0 })
    @ApiOperation({
        summary: 'Assign permissions to role',
        description: 'Replaces all permissions assigned to a role with the provided list.',
    })
    @ApiOkResponse({ description: 'Permissions assigned successfully' })
    @ApiBadRequestResponse({ description: 'Invalid permission IDs' })
    @ApiUnauthorizedResponse({ description: 'Authentication required' })
    @ApiForbiddenResponse({ description: 'User lacks rbac:assign_permissions permission' })
    @ApiNotFoundResponse({ description: 'Role or one or more permissions not found' })
    assignPermissions(@Param('id') id: string, @Body() dto: AssignPermissionsDto) {
        return this.roleService.assignPermissions(id, dto);
    }
}
