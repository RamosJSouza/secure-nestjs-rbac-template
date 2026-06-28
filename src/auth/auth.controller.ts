import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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
import { JwtAuthGuard } from './strategy/jwt-auth.guard';
import { PermissionGuard, RequirePermissions } from '@/common/guards/permission.guard';
import { Public } from '@/common/decorators/public.decorator';
import { Auditable } from '@/modules/audit/decorators/auditable.decorator';

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
      getTracker: (req: Record<string, any>) => req.ip ?? req.socket?.remoteAddress ?? '',
      generateKey: (ctx: ExecutionContext, tracker: string) => {
        const req = ctx.switchToHttp().getRequest();
        return buildLoginThrottleKey(tracker, req.body?.email);
      },
    },
  })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket?.remoteAddress;
    const userAgent = req.get('user-agent');
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
    const ip = req.ip ?? req.socket?.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.authService.refresh(dto, ip, userAgent);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, PermissionGuard)
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
  @UseGuards(JwtAuthGuard)
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
    @Req() req: Request & { user?: { id: string } },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}
