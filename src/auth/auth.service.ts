import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, EntityManager } from 'typeorm';
import { createHash, timingSafeEqual, randomUUID } from 'crypto';
import { compare, hash } from 'bcryptjs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Session } from '@/modules/auth/entities/session.entity';
import { User } from '@/modules/rbac/entities/user.entity';
import { Role } from '@/modules/rbac/entities/role.entity';
import { AuditLogService } from '@/modules/audit/audit-log.service';

const ACCESS_TOKEN_EXPIRES = '15m';
const ACCESS_TOKEN_EXPIRES_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_EXPIRES = '7d';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private auditLogService: AuditLogService,
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async revokeSessionFamilyAndLogReuse(
    reusedSession: Session,
    ip?: string,
    userAgent?: string,
    em?: EntityManager,
  ): Promise<void> {
    const userId = reusedSession.userId;
    const sessionFamilyIds = await this.getSessionFamilyIds(reusedSession);

    const repo = em ? em.getRepository(Session) : this.sessionRepository;
    const result = await repo
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: () => 'NOW()' })
      .where('user_id = :userId', { userId })
      .execute();

    this.logger.warn(
      `Refresh token reuse detected for user ${userId}, session ${reusedSession.id}. Revoked ${result.affected ?? 0} sessions.`,
    );

    await this.auditLogService.log({
      action: 'auth.refresh_token_reuse_detected',
      entityType: 'Session',
      entityId: reusedSession.id,
      actorUserId: userId,
      metadata: {
        reusedSessionId: reusedSession.id,
        revokedSessionCount: result.affected ?? 0,
        sessionFamilyIds,
      },
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
  }

  private async getSessionFamilyIds(session: Session): Promise<string[]> {
    const ids: string[] = [session.id];
    const visited = new Set<string>([session.id]);

    let current: Session | null = session;
    while (current?.rotatedFromSessionId) {
      const parent = await this.sessionRepository.findOne({
        where: { id: current.rotatedFromSessionId },
      });
      if (!parent || visited.has(parent.id)) break;
      ids.push(parent.id);
      visited.add(parent.id);
      current = parent;
    }

    let toVisit = [...ids];
    while (toVisit.length > 0) {
      const children = await this.sessionRepository.find({
        where: { rotatedFromSessionId: In(toVisit) },
      });
      toVisit = [];
      for (const c of children) {
        if (!visited.has(c.id)) {
          visited.add(c.id);
          ids.push(c.id);
          toVisit.push(c.id);
        }
      }
    }

    return ids;
  }

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    try {
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const user = await this.usersService.findOneWithPassword(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException(
        `Account locked due to too many failed attempts. Try again after ${user.lockedUntil.toISOString()}`,
      );
    }

    const isValid = await compare(dto.password, user.password);
    if (!isValid) {
      const result = await this.usersService.recordFailedLogin(user.id);
      if (result.lockedUntil) {
        await this.auditLogService.log({
          action: 'auth.account.locked',
          entityType: 'User',
          entityId: user.id,
          actorUserId: null,
          metadata: { email: user.email, failedAttempts: result.failedLoginAttempts },
          ip: ip ?? undefined,
          userAgent: userAgent ?? undefined,
        });
        throw new UnauthorizedException(
          `Account locked due to too many failed attempts. Try again after ${result.lockedUntil.toISOString()}`,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.resetFailedLogin(user.id);
    return this.createTokensAndSession(user, ip, userAgent);
  }

  async refresh(
    dto: RefreshDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const token = dto.refresh_token;
    if (!token) {
      throw new UnauthorizedException('Refresh token required');
    }

    let payload: { sub: string; email: string; roleId?: string; tokenType: 'access' | 'refresh'; jti?: string; exp: number };
    try {
      payload = this.jwtService.verify(token, { algorithms: ['RS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }

    const tokenHash = this.hashRefreshToken(token);

    return this.sessionRepository.manager.transaction(async (em) => {
      const session = await em.findOne(Session, {
        where: { refreshTokenHash: tokenHash },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!session) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (!this.constantTimeCompare(tokenHash, session.refreshTokenHash)) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const now = new Date();
      if (session.revokedAt) {
        await this.revokeSessionFamilyAndLogReuse(session, ip, userAgent, em);
        throw new UnauthorizedException('Refresh token reuse detected. All sessions have been revoked.');
      }
      if (session.expiresAt < now) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const user = session.user;
      if (!user.isActive) {
        throw new UnauthorizedException('User account is deactivated');
      }
      if (user.lockedUntil && user.lockedUntil > now) {
        throw new UnauthorizedException(
          `Account locked due to too many failed attempts. Try again after ${user.lockedUntil.toISOString()}`,
        );
      }

      session.revokedAt = new Date();
      await em.save(session);

      const basePayload = { sub: user.id, email: user.email, roleId: user.roleId };
      const accessJti = randomUUID();
      const refreshJti = randomUUID();
      const accessToken = this.jwtService.sign(
        { ...basePayload, tokenType: 'access', jti: accessJti },
        { expiresIn: ACCESS_TOKEN_EXPIRES, algorithm: 'RS256' },
      );
      const refreshToken = this.jwtService.sign(
        { ...basePayload, tokenType: 'refresh', jti: refreshJti },
        { expiresIn: REFRESH_TOKEN_EXPIRES, algorithm: 'RS256' },
      );
      const newHash = this.hashRefreshToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const newSession = em.create(Session, {
        userId: user.id,
        refreshTokenHash: newHash,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
        jti: refreshJti,
        rotatedFromSessionId: session.id,
      });
      await em.save(newSession);

      return { email: user.email, access_token: accessToken, refresh_token: refreshToken };
    });
  }

  private async createTokensAndSession(
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const payload = { sub: user.id, email: user.email, roleId: user.roleId };
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const accessToken = this.jwtService.sign(
      { ...payload, tokenType: 'access', jti: accessJti },
      {
        expiresIn: ACCESS_TOKEN_EXPIRES,
        algorithm: 'RS256',
      },
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: 'refresh', jti: refreshJti },
      {
        expiresIn: REFRESH_TOKEN_EXPIRES,
        algorithm: 'RS256',
      },
    );

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
      jti: refreshJti,
    });
    await this.sessionRepository.save(session);

    return {
      email: user.email,
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findOne(dto.email);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    let roleId = dto.roleId;
    if (!roleId) {
      const defaultRole = await this.roleRepository.findOne({ where: { name: 'Viewer' } });
      if (!defaultRole) {
        throw new InternalServerErrorException('Default role "Viewer" not found');
      }
      roleId = defaultRole.id;
    }

    const hashedPassword = await hash(dto.password, 12);

    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
      roleId,
    });

    return { message: 'User created with success', userId: user.id };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ userId: string }> {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentValid = await compare(currentPassword, user.password);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await hash(newPassword, 12);
    await this.usersService.updatePassword(userId, hashedPassword);

    const result = await this.sessionRepository
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: () => 'NOW()' })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();

    this.logger.log(
      `Password changed for user ${userId}. Revoked ${result.affected ?? 0} active sessions.`,
    );

    return { userId };
  }

  async logout(userId: string, accessJti: string, refreshToken?: string): Promise<void> {
    if (accessJti) {
      await this.cacheManager.set(`jti:${accessJti}`, 1, ACCESS_TOKEN_EXPIRES_MS);
    }
    if (refreshToken) {
      const tokenHash = this.hashRefreshToken(refreshToken);
      const session = await this.sessionRepository.findOne({ where: { refreshTokenHash: tokenHash } });
      if (session && !session.revokedAt && session.userId === userId) {
        session.revokedAt = new Date();
        await this.sessionRepository.save(session);
      }
    }
  }

  async logoutAll(userId: string, accessJti: string): Promise<void> {
    if (accessJti) {
      await this.cacheManager.set(`jti:${accessJti}`, 1, ACCESS_TOKEN_EXPIRES_MS);
    }
    await this.sessionRepository
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: () => 'NOW()' })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }
}
