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
import { RoleService } from '../services/role.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, RoleResponseDto, QueryRoleDto, PaginatedRoleResponseDto } from '../dto/role.dto';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RbacEndpoint } from '../decorators/rbac-endpoint.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(PermissionGuard)
export class RoleController {
    constructor(private readonly roleService: RoleService) { }

    @Post()
    @RbacEndpoint({
        permission: 'rbac:create',
        summary: 'Create a new role',
        description: 'Creates a new role. Requires rbac:create permission.',
        auditable: { action: 'role.create', entityType: 'Role' },
    })
    @ApiCreatedResponse({ description: 'Role created successfully', type: RoleResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiConflictResponse({ description: 'Role name already exists' })
    create(@Body() dto: CreateRoleDto) {
        return this.roleService.create(dto);
    }

    @Get()
    @RbacEndpoint({
        permission: 'rbac:view',
        summary: 'List all roles',
        description: 'Returns paginated role metadata without nested permissions. Use GET /roles/:id for the full permission graph.',
    })
    @ApiOkResponse({ description: 'Paginated list of roles', type: PaginatedRoleResponseDto })
    findAll(@Query() query: QueryRoleDto) {
        return this.roleService.findAll(query);
    }

    @Get(':id')
    @RbacEndpoint({
        permission: 'rbac:view',
        summary: 'Get role by ID',
        description: 'Returns a single role by UUID with its permissions.',
    })
    @ApiOkResponse({ description: 'Role details', type: RoleResponseDto })
    @ApiNotFoundResponse({ description: 'Role not found' })
    findOne(@Param('id') id: string) {
        return this.roleService.findOne(id);
    }

    @Put(':id')
    @RbacEndpoint({
        permission: 'rbac:edit',
        summary: 'Update role',
        description: 'Updates an existing role. Requires rbac:edit permission.',
        auditable: { action: 'role.update', entityType: 'Role', entityIdParam: 0 },
    })
    @ApiOkResponse({ description: 'Role updated successfully', type: RoleResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid request body' })
    @ApiNotFoundResponse({ description: 'Role not found' })
    @ApiConflictResponse({ description: 'Role name already exists' })
    update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
        return this.roleService.update(id, dto);
    }

    @Delete(':id')
    @RbacEndpoint({
        permission: 'rbac:delete',
        summary: 'Delete role',
        description: 'Deletes a role. Fails if users are assigned to the role.',
        auditable: { action: 'role.delete', entityType: 'Role', entityIdParam: 0 },
    })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse({ description: 'Role deleted successfully' })
    @ApiNotFoundResponse({ description: 'Role not found' })
    @ApiConflictResponse({ description: 'Cannot delete role with assigned users' })
    remove(@Param('id') id: string) {
        return this.roleService.remove(id);
    }

    @Post(':id/permissions')
    @RbacEndpoint({
        permission: 'rbac:assign_permissions',
        summary: 'Assign permissions to role',
        description: 'Replaces all permissions assigned to a role with the provided list.',
        auditable: { action: 'role.assign_permissions', entityType: 'Role', entityIdParam: 0 },
    })
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({ description: 'Permissions assigned successfully' })
    @ApiBadRequestResponse({ description: 'Invalid permission IDs' })
    @ApiNotFoundResponse({ description: 'Role or one or more permissions not found' })
    assignPermissions(@Param('id') id: string, @Body() dto: AssignPermissionsDto) {
        return this.roleService.assignPermissions(id, dto);
    }
}
