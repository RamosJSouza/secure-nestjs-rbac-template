# Audit Module

Append-only audit logging with enforcement: no mutation allowed without audit.

## Garantias

- **Append-only:** Logs são inseridos; não há UPDATE ou DELETE em registros de auditoria.
- **Correlation ID:** Cada requisição recebe um `X-Correlation-Id` (gerado ou passado no header); o valor é propagado aos logs e ao audit log para rastreamento.
- **Structured logging:** Logs Pino estruturados incluem `correlationId` para correlacionar requisições com eventos de auditoria.

## Components

### @Auditable Decorator

Marks controller methods that perform auditable mutations. The interceptor auto-logs on success.

```ts
@Auditable(action: string, entityType: string, options?: {
  entityIdParam?: number;      // Arg index for entityId (default: 0)
  entityIdFromResult?: string; // Property on result (e.g. 'userId', 'id')
})
```

### AuditInterceptor

Global interceptor that:
- Detects methods with `@Auditable`
- On success: calls `AuditLogService.log` with action, entityType, entityId, metadata
- On error: does not audit (mutation did not occur)

### Manual audit (non-HTTP flows)

For flows outside `@Auditable` (e.g. auth events in `AuthService`), inject `AuditLogService` and call `log()` directly.

## Example Integration

### Controller with @Auditable

```ts
@Controller('roles')
export class RoleController {
  @Post()
  @Auditable('role.create', 'Role')
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);  // result.id used for entityId
  }

  @Put(':id')
  @Auditable('role.update', 'Role', { entityIdParam: 0 })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);  // id from first param
  }

  @Delete(':id')
  @Auditable('role.delete', 'Role', { entityIdParam: 0 })
  remove(@Param('id') id: string) {
    return this.roleService.remove(id);
  }
}
```

### Actions audited

| Action | Entity | Endpoint | Fonte |
|--------|--------|----------|-------|
| user.create | User | POST /auth/register | @Auditable |
| user.change_password | User | POST /auth/change-password | @Auditable |
| role.create | Role | POST /roles | @Auditable |
| role.update | Role | PUT /roles/:id | @Auditable |
| role.delete | Role | DELETE /roles/:id | @Auditable |
| role.assign_permissions | Role | POST /roles/:id/permissions | @Auditable |
| auth.refresh_token_reuse_detected | Session | — | AuthService (manual) |
| auth.account.locked | User | — | AuthService (manual) |
