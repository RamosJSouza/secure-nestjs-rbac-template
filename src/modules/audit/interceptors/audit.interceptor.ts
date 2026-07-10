import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { AUDITABLE_KEY, AuditableOptions } from '../decorators/auditable.decorator';
import { AuditLogService } from '../audit-log.service';
import { extractRequestContext, type RequestLike } from '@/common/utils/request-context.util';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditableOptions | undefined>(
      AUDITABLE_KEY,
      context.getHandler(),
    );

    if (!options) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (result) => this.logAudit(context, options, result),
        error: () => {
          /* Do not audit on error - mutation did not occur */
        },
      }),
    );
  }

  private logAudit(
    context: ExecutionContext,
    options: AuditableOptions,
    result: unknown,
  ): void {
    const req = context.switchToHttp().getRequest<RequestLike & { body?: { permissionIds?: unknown } }>();
    const { ip, userAgent } = extractRequestContext(req);
    const entityId = this.resolveEntityId(context, options, result);
    void this.auditLogService.log({
      action: options.action,
      entityType: options.entityType,
      entityId: entityId ?? undefined,
      ip,
      userAgent,
      metadata: this.buildMetadata(req, result),
    });
  }

  private resolveEntityId(
    context: ExecutionContext,
    options: AuditableOptions,
    result: unknown,
  ): string | null {
    if (options.entityIdFromResult && result && typeof result === 'object') {
      const key = options.entityIdFromResult;
      const value = (result as Record<string, unknown>)[key];
      if (typeof value === 'string') return value;
    }

    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const id = (result as Record<string, unknown>).id;
      if (typeof id === 'string') return id;
    }

    const args = context.getArgs();
    const param = options.entityIdParam;
    const paramIndex = typeof param === 'number' ? param : 0;

    if (args[paramIndex] != null) {
      const arg = args[paramIndex];
      if (typeof arg === 'string') return arg;
      if (arg && typeof arg === 'object' && 'id' in arg) {
        const id = (arg as { id: unknown }).id;
        if (typeof id === 'string') return id;
      }
    }

    return null;
  }

  private buildMetadata(
    req: (RequestLike & { body?: { permissionIds?: unknown } }) | undefined,
    result: unknown,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const obj = result as Record<string, unknown>;
      if (obj.permissionIds && Array.isArray(obj.permissionIds)) {
        metadata.permissionIds = obj.permissionIds;
      }
    }

    if (!metadata.permissionIds) {
      const bodyPermissionIds = req?.body?.permissionIds;
      if (Array.isArray(bodyPermissionIds)) {
        metadata.permissionIds = bodyPermissionIds;
      }
    }

    return metadata;
  }
}
