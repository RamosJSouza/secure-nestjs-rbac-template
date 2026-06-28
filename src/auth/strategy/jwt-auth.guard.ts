import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, _info: any) {
    if (err) {
      throw err || new UnauthorizedException();
    }

    if (!user) {
      throw new UnauthorizedException('Authentication token required');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Account is locked. Try again later.');
    }

    return user;
  }
}
