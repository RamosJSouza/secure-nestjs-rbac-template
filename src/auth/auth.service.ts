import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { compareSync, hashSync, compare, hash } from 'bcryptjs';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Session } from '@/modules/auth/entities/session.entity';
import { User } from '@/modules/rbac/entities/user.entity';
import { AuditLogService } from '@/modules/audit/audit-log.service';

const ACCESS_TOKEN_EXPIRES = '15m';
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
  ) {}

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async revokeSessionFamilyAndLogReuse(
    reusedSession: Session,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const userId = reusedSession.userId;
    const sessionFamilyIds = await this.getSessionFamilyIds(reusedSession);

    const result = await this.sessionRepository
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
    const user = await this.usersService.findOne(dto.email);

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

    const isValid = compareSync(dto.password, user.password);
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

    let payload: { sub: string; email: string; roleId?: string; tokenType: 'access' | 'refresh'; exp: number };
    try {
      payload = this.jwtService.verify(token, { algorithms: ['RS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }

    const tokenHash = this.hashRefreshToken(token);
    const session = await this.sessionRepository.findOne({
      where: { refreshTokenHash: tokenHash },
      relations: ['user'],
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!this.constantTimeCompare(tokenHash, session.refreshTokenHash)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = new Date();
    if (session.revokedAt) {
      await this.revokeSessionFamilyAndLogReuse(session, ip, userAgent);
      throw new UnauthorizedException('Refresh token reuse detected. All sessions have been revoked.');
    }

    if (session.expiresAt < now) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = session.user;
    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    return this.rotateSession(session, user, ip, userAgent);
  }

  private async createTokensAndSession(
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    const payload = { sub: user.id, email: user.email, roleId: user.roleId };

    const accessToken = this.jwtService.sign(
      { ...payload, tokenType: 'access' },
      {
        expiresIn: ACCESS_TOKEN_EXPIRES,
        algorithm: 'RS256',
      },
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: 'refresh' },
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
    });
    await this.sessionRepository.save(session);

    return {
      email: user.email,
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  private async rotateSession(
    oldSession: Session,
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<{ email: string; access_token: string; refresh_token: string }> {
    oldSession.revokedAt = new Date();
    await this.sessionRepository.save(oldSession);

    const payload = { sub: user.id, email: user.email, roleId: user.roleId };

    const accessToken = this.jwtService.sign(
      { ...payload, tokenType: 'access' },
      {
        expiresIn: ACCESS_TOKEN_EXPIRES,
        algorithm: 'RS256',
      },
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: 'refresh' },
      {
        expiresIn: REFRESH_TOKEN_EXPIRES,
        algorithm: 'RS256',
      },
    );

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const newSession = this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
      rotatedFromSessionId: oldSession.id,
    });
    await this.sessionRepository.save(newSession);

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

    const hashedPassword = hashSync(dto.password, 10);

    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
    });

    return { message: 'User created with success', userId: user.id };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ userId: string }> {
    const user = await this.usersService.findById(userId);
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

    await this.auditLogService.log({
      action: 'auth.password_change',
      entityType: 'User',
      entityId: userId,
      actorUserId: userId,
      metadata: { revokedSessionCount: result.affected ?? 0 },
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    return { userId };
  }
}
