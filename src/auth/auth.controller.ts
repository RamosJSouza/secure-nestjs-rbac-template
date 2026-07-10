import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LogoutDto } from './dto/logout.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { buildLoginThrottleKey } from './throttlers/login-throttle.util';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { PermissionGuard, RequirePermissions } from '@/common/guards/permission.guard';
import { Public } from '@/common/decorators/public.decorator';
import { Auditable } from '@/modules/audit/decorators/auditable.decorator';
import { extractRequestContext, getClientIp } from '@/common/utils/request-context.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticates a user and returns access and refresh tokens.',
  })
  @ApiOkResponse({ description: 'Login successful, returns access_token and refresh_token' })
  @ApiBadRequestResponse({ description: 'Invalid email or password' })
  @SkipThrottle({ default: true })
  @Throttle({
    login: {
      limit: 10,
      ttl: 60_000,
      getTracker: (req: Request) => getClientIp(req),
      generateKey: (ctx: ExecutionContext, tracker: string) => {
        const req = ctx.switchToHttp().getRequest();
        return buildLoginThrottleKey(tracker, req.body?.email);
      },
    },
  })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const { ip, userAgent } = extractRequestContext(req);
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchanges a valid refresh token for new access and refresh tokens.',
  })
  @ApiOkResponse({ description: 'New access_token and refresh_token' })
  @ApiBadRequestResponse({ description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const { ip, userAgent } = extractRequestContext(req);
    return this.authService.refresh(dto, ip, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout',
    description: 'Revokes the current session and denylists the access token.',
  })
  @ApiOkResponse({ description: 'Logged out' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async logout(
    @Req() req: Request & { user?: { id: string; jti?: string } },
    @Body() dto: LogoutDto,
  ) {
    await this.authService.logout(req.user!.id, req.user?.jti, dto.refresh_token);
    return { message: 'Logged out' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout all sessions',
    description: 'Revokes all sessions for the user and denylists the access token.',
  })
  @ApiOkResponse({ description: 'All sessions revoked' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async logoutAll(@Req() req: Request & { user?: { id: string; jti?: string } }) {
    await this.authService.logoutAll(req.user!.id, req.user?.jti);
    return { message: 'All sessions revoked' };
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List active sessions',
    description: 'Returns non-revoked, non-expired sessions for the authenticated user.',
  })
  @ApiOkResponse({ description: 'Active sessions', type: [SessionResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  listSessions(@Req() req: Request & { user: { id: string } }) {
    return this.authService.listSessions(req.user.id);
  }

  @Post('register')
  @UseGuards(PermissionGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiTags('auth', 'Users')
  @ApiOperation({
    summary: 'Create user (admin only)',
    description: 'Registers a new user. Requires users:create permission.',
  })
  @ApiCreatedResponse({ description: 'User created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid request body or validation error' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'User lacks users:create permission' })
  @RequirePermissions('users:create')
  @Auditable('user.create', 'User', { entityIdFromResult: 'userId' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password',
    description: 'Changes the password of the authenticated user.',
  })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid password format' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @Auditable('user.change_password', 'User', { entityIdFromResult: 'userId' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
