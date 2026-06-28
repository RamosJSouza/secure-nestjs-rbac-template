import { Body, Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/strategy/jwt-auth.guard';
import { PermissionGuard, RequirePermissions } from './common/guards/permission.guard';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): object {
    return this.appService.getHello();
  }

  @Get('/premium-echo')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions('rbac:view')
  getPremiumEcho(@Body() body) {
    return body;
  }
}
