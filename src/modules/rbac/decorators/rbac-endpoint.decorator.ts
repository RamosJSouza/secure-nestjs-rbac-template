import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { RequirePermissions } from '@/common/guards/permission.guard';
import { Auditable, AuditableOptions } from '@/modules/audit/decorators/auditable.decorator';

export interface RbacEndpointOptions {
    permission: string;
    summary?: string;
    description?: string;
    auditable?: AuditableOptions;
}

export function RbacEndpoint(options: RbacEndpointOptions): MethodDecorator {
    const decorators: MethodDecorator[] = [
        RequirePermissions(options.permission),
        ApiUnauthorizedResponse({ description: 'Authentication required' }),
        ApiForbiddenResponse({ description: `User lacks ${options.permission} permission` }),
        ApiOperation({ summary: options.summary, description: options.description }),
    ];

    if (options.auditable) {
        const { action, entityType, ...auditOpts } = options.auditable;
        decorators.push(Auditable(action, entityType, auditOpts));
    }

    return applyDecorators(...decorators);
}
