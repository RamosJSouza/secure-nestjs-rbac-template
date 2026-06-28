import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor() {
    super();
  }

  canActivate(context: ExecutionContext) {
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
