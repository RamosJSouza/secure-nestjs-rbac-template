import { Controller, Patch, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOkResponse, ApiBadRequestResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { UserAdminService } from '../services/user-admin.service';
import { SetUserActiveDto } from '../dto/user-admin.dto';
import { PermissionGuard } from '@/common/guards/permission.guard';
import { RbacEndpoint } from '../decorators/rbac-endpoint.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(PermissionGuard)
export class UserController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @Patch(':id/active')
  @RbacEndpoint({
    permission: 'users:edit',
    summary: 'Activate or deactivate a user',
    description: 'Sets the isActive flag. Deactivation revokes all sessions and denylists active access JTIs immediately.',
    auditable: { action: 'user.set_active', entityType: 'User', entityIdParam: 0 },
  })
  @ApiOkResponse({ description: 'User active status updated' })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiNotFoundResponse({ description: 'User not found' })
  setUserActive(@Param('id') id: string, @Body() dto: SetUserActiveDto) {
    return this.userAdminService.setUserActive(id, dto.isActive);
  }
}
