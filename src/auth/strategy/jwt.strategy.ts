import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UsersService } from 'src/users/users.service';
import { RequestContext } from '@/logger/request-context';

const USER_CACHE_TTL_MS = 30_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('keys.publicKey'),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    roleId?: string;
    tokenType: 'access' | 'refresh';
    jti?: string;
  }) {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException('Wrong token type');
    }

    if (payload.jti) {
      const denied = await this.cacheManager.get(`jti:${payload.jti}`);
      if (denied) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    const cacheKey = `user:${payload.sub}`;
    let user = (await this.cacheManager.get<any>(cacheKey)) ?? undefined;
    if (!user) {
      user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }
      await this.cacheManager.set(cacheKey, user, USER_CACHE_TTL_MS);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    RequestContext.setUser(user.id);

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Account is locked. Try again later.');
    }

    return { ...user, jti: payload.jti };
  }
}
