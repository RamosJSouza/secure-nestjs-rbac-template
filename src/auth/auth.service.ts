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
import { Repository, IsNull, MoreThan } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { compare, hash } from 'bcryptjs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { Session } from '@/modules/auth/entities/session.entity';
import { User } from '@/modules/rbac/entities/user.entity';
import { Role } from '@/modules/rbac/entities/role.entity';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { INVALID_CREDENTIALS_MESSAGE } from './auth.constants';
import { getErrorMessage } from '@/common/utils/error-message.util';

const ACCESS_TOKEN_EXPIRES = '15m';
const ACCESS_TOKEN_EXPIRES_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_EXPIRES = '7d';
const REFRESH_TOKEN_DAYS = 7;

type TokenUser = Pick<User, 'id' | 'email' | 'roleId'>;

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

  private buildTokenPair(user: TokenUser) {
    const basePayload = { sub: user.id, email: user.email, roleId: user.roleId };
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const signOptions = { algorithm: 'RS256' as const };

    const accessToken = this.jwtService.sign(
      { ...basePayload, tokenType: 'access', jti: accessJti },
      { ...signOptions, expiresIn: ACCESS_TOKEN_EXPIRES },
    );
    const refreshToken = this.jwtService.sign(
      { ...basePayload, tokenType: 'refresh', jti: refreshJti },
      { ...signOptions, expiresIn: REFRESH_TOKEN_EXPIRES },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    return { accessToken, refreshToken, accessJti, refreshJti, expiresAt };
  }

  private async revokeAllUserSessions(
    userId: string,
    repo: Repository<Session> = this.sessionRepository,
  ): Promise<number> {
    const result = await repo
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: () => 'NOW()' })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();

    return result.affected ?? 0;
  }

  private async revokeSessionByRefreshHash(
    userId: string,
    refreshTokenHash: string,
    repo: Repository<Session> = this.sessionRepository,
  ): Promise<void> {
    await repo
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: () => 'NOW()' })
      .where(
        'user_id = :userId AND refresh_token_hash = :hash AND revoked_at IS NULL',
        { userId, hash: refreshTokenHash },
      )
      .execute();
  }

  private logAuditFireAndForget(payload: Parameters<AuditLogService['log']>[0]): void {
    void Promise.resolve(this.auditLogService.log(payload)).catch((err: unknown) => {
      this.logger.warn(`Audit log failed for ${payload.action}: ${getErrorMessage(err)}`);
    });
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const user = await this.usersService.findOneWithPassword(dto.email);

    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (!user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const isValid = await compare(dto.password, user.password);
    if (!isValid) {
      const result = await this.usersService.recordFailedLogin(user.id);
      if (result.lockedUntil) {
        this.logAuditFireAndForget({
          action: 'auth.account.locked',
          entityType: 'User',
          entityId: user.id,
          actorUserId: null,
          metadata: { email: user.email, failedAttempts: result.failedLoginAttempts },
          ip,
          userAgent,
        });
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.usersService.resetFailedLogin(user.id);
    return this.createTokensAndSession(user, ip, userAgent);
  }

  async refresh(
    dto: RefreshDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    let payload: {
      sub: string;
      email: string;
      roleId?: string;
      tokenType: 'access' | 'refresh';
      jti?: string;
      exp: number;
    };
    try {
      payload = this.jwtService.verify(dto.refresh_token, { algorithms: ['RS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }

    const tokenHash = this.hashRefreshToken(dto.refresh_token);

    const txResult = await this.sessionRepository.manager.transaction(async (em) => {
      const session = await em.findOne(Session, {
        where: { refreshTokenHash: tokenHash },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!session) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const now = new Date();

      if (session.revokedAt) {
        const revokedCount = await this.revokeAllUserSessions(
          session.userId,
          em.getRepository(Session),
        );

        this.logger.warn(
          `Refresh token reuse detected for user ${session.userId}, session ${session.id}. Revoked ${revokedCount} active sessions.`,
        );

        return {
          kind: 'reuse' as const,
          reusedSessionId: session.id,
          userId: session.userId,
          revokedCount,
          ip,
          userAgent,
        };
      }

      if (session.expiresAt < now) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const user = session.user;
      if (!user.isActive || (user.lockedUntil && user.lockedUntil > now)) {
        throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
      }

      const ipMismatch = ip && session.ip && ip !== session.ip;
      const uaMismatch = userAgent && session.userAgent && userAgent !== session.userAgent;
      const contextMismatchAudit =
        ipMismatch || uaMismatch
          ? {
              action: 'auth.session.context_mismatch' as const,
              entityType: 'Session' as const,
              entityId: session.id,
              actorUserId: session.userId,
              metadata: {
                sessionIp: session.ip,
                requestIp: ip,
                sessionUserAgent: session.userAgent,
                requestUserAgent: userAgent,
              },
              ip,
              userAgent,
            }
          : undefined;

      await em
        .createQueryBuilder()
        .update(Session)
        .set({ revokedAt: () => 'NOW()' })
        .where('id = :id', { id: session.id })
        .execute();

      const { accessToken, refreshToken, accessJti, refreshJti, expiresAt } = this.buildTokenPair(user);
      const newSession = em.create(Session, {
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        accessJti,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
        jti: refreshJti,
        rotatedFromSessionId: session.id,
      });
      await em.save(newSession);

      return {
        kind: 'success' as const,
        email: user.email,
        access_token: accessToken,
        refresh_token: refreshToken,
        contextMismatchAudit,
      };
    });

    if (txResult.kind === 'reuse') {
      this.logAuditFireAndForget({
        action: 'auth.refresh_token_reuse_detected',
        entityType: 'Session',
        entityId: txResult.reusedSessionId,
        actorUserId: null,
        metadata: {
          reusedSessionId: txResult.reusedSessionId,
          suspectedReuse: true,
          revokedSessionCount: txResult.revokedCount,
        },
        ip: txResult.ip,
        userAgent: txResult.userAgent,
      });
      throw new UnauthorizedException('Refresh token reuse detected. All sessions have been revoked.');
    }

    if (txResult.contextMismatchAudit) {
      this.logAuditFireAndForget(txResult.contextMismatchAudit);
    }

    return {
      email: txResult.email,
      access_token: txResult.access_token,
      refresh_token: txResult.refresh_token,
    };
  }

  private async createTokensAndSession(
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const { accessToken, refreshToken, accessJti, refreshJti, expiresAt } = this.buildTokenPair(user);

    const session = this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      accessJti,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
      jti: refreshJti,
    });
    await this.sessionRepository.save(session);

    this.logAuditFireAndForget({
      action: 'auth.login_success',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      metadata: {},
      ip,
      userAgent,
    });

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

    const revokedCount = await this.revokeAllUserSessions(userId);
    this.logger.log(`Password changed for user ${userId}. Revoked ${revokedCount} active sessions.`);

    return { userId };
  }

  async logout(userId: string, accessJti: string | undefined, refreshToken?: string): Promise<void> {
    if (accessJti) {
      await this.cacheManager.set(`jti:${accessJti}`, 1, ACCESS_TOKEN_EXPIRES_MS);
    }
    if (refreshToken) {
      await this.revokeSessionByRefreshHash(userId, this.hashRefreshToken(refreshToken));
    }
  }

  async logoutAll(userId: string, accessJti: string | undefined): Promise<void> {
    if (accessJti) {
      await this.cacheManager.set(`jti:${accessJti}`, 1, ACCESS_TOKEN_EXPIRES_MS);
    }
    await this.revokeAllUserSessions(userId);
  }

  async listSessions(userId: string): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionRepository.find({
      where: {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    return sessions.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }
}
