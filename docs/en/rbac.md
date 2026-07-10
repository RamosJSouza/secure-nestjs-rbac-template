# RBAC (Role-Based Access Control)

The system implements granular role-based access control with the chain:

**Feature → Permission → RolePermission → Role → User**

## Entities

### 1. Feature
Module or resource.
- **Fields:** `key`, `name`, `description`, `isActive`
- **Examples:** `rbac`, `users`, `financial`

### 2. Permission
Action within a Feature.
- **Relation:** Belongs to a Feature
- **Format:** `featureKey:action` (e.g. `rbac:view`, `users:create`)
- **Common actions:** `view`, `create`, `edit`, `delete`, `assign_permissions`

### 3. Role
Collection of permissions.
- **Fields:** `name`, `description`, `isActive`
- **Examples:** Super Admin, Manager, Viewer

### 4. RolePermission
Role ↔ Permission association.
- **Fields:** `roleId`, `permissionId`, `granted` (boolean)

### 5. User
System user.
- **Relation:** Linked to a Role (`roleId`)
- **Entity:** `src/modules/rbac/entities/user.entity.ts`

## Route Protection

All mutation and sensitive read endpoints require:
1. `JwtAuthGuard` — valid Bearer token
2. `PermissionGuard` — specific permission via `@RequirePermissions`

```typescript
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RoleController {
  @Get()
  @RequirePermissions('rbac:view')
  findAll() { ... }

  @Post()
  @RequirePermissions('rbac:create')
  create(@Body() dto: CreateRoleDto) { ... }
}
```

## Permission Check

`PermissionGuard` uses `RbacService` to verify the user's Role has the required Permission in `role_permissions` with `granted = true`.

## RBAC Endpoints

List endpoints (`GET /roles`, `GET /features`) return **paginated entity metadata only** — no nested permissions. Use `GET /roles/:id` or `GET /features/:id` for the full graph including permissions.

| Resource | GET | GET/:id | POST | PUT/:id | DELETE/:id |
|----------|-----|---------|------|---------|------------|
| Features | rbac:view | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Roles | rbac:view | rbac:view | rbac:create | rbac:edit | rbac:delete |
| Permissions | rbac:view | — | rbac:create | rbac:edit | rbac:delete |
| Assign perms | — | — | rbac:assign_permissions (POST /roles/:id/permissions) | — | — |
