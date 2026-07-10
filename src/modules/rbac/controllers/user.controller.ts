import { Controller, Patch, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiBadRequestResponse,
  ApiUnauthorizedResponse, ApiForbiddenResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { UserAdminService } from '../services/user-admin.service';
import { SetUserActiveDto } from '../dto/user-admin.dto';
import { PermissionGuard, RequirePermissions } from '@/common/guards/permission.guard';
import { Auditable } from '@/modules/audit/decorators/auditable.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(PermissionGuard)
export class UserController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @Patch(':id/active')
  @RequirePermissions('users:edit')
  @Auditable('user.set_active', 'User', { entityIdParam: 0 })
  @ApiOperation({
    summary: 'Activate or deactivate a user',
    description: 'Sets the isActive flag. Deactivation revokes all sessions and denylists active access JTIs immediately.',
  })
  @ApiOkResponse({ description: 'User active status updated' })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'User lacks users:edit permission' })
  @ApiNotFoundResponse({ description: 'User not found' })
  setUserActive(@Param('id') id: string, @Body() dto: SetUserActiveDto) {
    return this.userAdminService.setUserActive(id, dto.isActive);
  }
}
