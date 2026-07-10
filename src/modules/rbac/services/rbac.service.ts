import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { RolePermission } from '../entities/role-permission.entity';
import { isRedisConfigured } from '@/config/redis-connection.factory';
import { getErrorMessage } from '@/common/utils/error-message.util';
import {
    incrementRbacGlobalEpoch,
    readRbacGlobalEpoch,
    RBAC_GLOBAL_EPOCH_KEY,
} from '@/config/cache-stores.factory';

interface CachedRolePermissions {
    epoch: number;
    permissions: string[];
}

@Injectable()
export class RbacService {
    private readonly logger = new Logger(RbacService.name);
    private readonly ttl: number;
    private readonly pendingRequests = new Map<string, Promise<string[]>>();
    private readonly cachedRoleKeys = new Set<string>();
    private invalidationEpoch = 0;

    constructor(
        @InjectRepository(RolePermission)
        private rolePermissionRepository: Repository<RolePermission>,
        @Inject(CACHE_MANAGER)
        private cacheManager: Cache,
        private configService: ConfigService,
    ) {
        this.ttl = this.configService.get<number>('RBAC_CACHE_TTL', 300000);
    }

    private usesSharedEpoch(): boolean {
        return isRedisConfigured(this.configService);
    }

    private async getGlobalEpoch(): Promise<number> {
        if (!this.usesSharedEpoch()) {
            return this.invalidationEpoch;
        }

        try {
            const stored = await readRbacGlobalEpoch();
            if (stored !== null) {
                this.invalidationEpoch = stored;
                return stored;
            }
        } catch (error) {
            this.logger.warn(`Failed to read ${RBAC_GLOBAL_EPOCH_KEY}, using local epoch`, getErrorMessage(error));
        }

        return this.invalidationEpoch;
    }

    private async bumpGlobalEpoch(): Promise<number> {
        if (!this.usesSharedEpoch()) {
            this.invalidationEpoch++;
            return this.invalidationEpoch;
        }

        try {
            const next = await incrementRbacGlobalEpoch();
            this.invalidationEpoch = next;
            return next;
        } catch (error) {
            this.invalidationEpoch++;
            this.logger.warn(`Failed to bump ${RBAC_GLOBAL_EPOCH_KEY}, using local epoch`, getErrorMessage(error));
            return this.invalidationEpoch;
        }
    }

    /**
     * Checks if a user (via role) has the required permissions.
     * Fail-safe: If cache fails, it falls back to DB.
     */
    async checkPermissions(roleId: string, requiredPermissions: string[]): Promise<boolean> {
        if (!roleId || !requiredPermissions.length) {
            return false;
        }

        try {
            const userPermissions = await this.getPermissionsForRole(roleId);
            const permSet = new Set(userPermissions);
            return requiredPermissions.every((perm) => permSet.has(perm));
        } catch (error) {
            this.logger.error(`Critical RBAC error for role ${roleId}`, getErrorMessage(error));
            return false;
        }
    }

    async getPermissionsForRole(roleId: string): Promise<string[]> {
        const cacheKey = `rbac:role:${roleId}:permissions`;
        let currentEpoch: number | undefined;

        try {
            currentEpoch = await this.getGlobalEpoch();
            const cached = await this.cacheManager.get<CachedRolePermissions>(cacheKey);
            if (cached && cached.epoch === currentEpoch) {
                return cached.permissions;
            }
        } catch (error) {
            this.logger.warn(`Redis cache get failed for ${cacheKey}, falling back to DB`, getErrorMessage(error));
        }

        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey)!;
        }

        const fetchPromise = (async () => {
            const epochSnapshot = this.invalidationEpoch;
            try {
                const rolePermissions = await this.rolePermissionRepository.find({
                    where: { roleId },
                    relations: ['permission', 'permission.feature'],
                    select: {
                        id: true,
                        permission: {
                            id: true,
                            action: true,
                            feature: {
                                id: true,
                                key: true,
                            },
                        },
                    },
                });

                const permissions = rolePermissions.map(
                    (rp) => `${rp.permission.feature.key}:${rp.permission.action}`,
                );

                if (epochSnapshot === this.invalidationEpoch) {
                    const epoch = currentEpoch ?? (await this.getGlobalEpoch());
                    const entry: CachedRolePermissions = { epoch, permissions };
                    this.cacheManager.set(cacheKey, entry, this.ttl).catch((err: unknown) => {
                        this.logger.warn(`Redis cache set failed for ${cacheKey}`, getErrorMessage(err));
                    });
                    this.cachedRoleKeys.add(cacheKey);
                }

                return permissions;
            } finally {
                this.pendingRequests.delete(cacheKey);
            }
        })();

        this.pendingRequests.set(cacheKey, fetchPromise);
        return fetchPromise;
    }

    async invalidateRoleCache(roleId: string): Promise<void> {
        const cacheKey = `rbac:role:${roleId}:permissions`;
        await this.bumpGlobalEpoch();
        this.pendingRequests.delete(cacheKey);
        this.cachedRoleKeys.delete(cacheKey);
        this.logger.log(`Invalidated cache for role ${roleId}`);
    }

    /**
     * Invalidates every cached role permission set.
     * Used when a Feature key or Permission action changes, since the cached
     * `featureKey:action` strings become stale across all roles.
     */
    async invalidateAllRoles(): Promise<void> {
        await this.bumpGlobalEpoch();
        const count = this.cachedRoleKeys.size;
        this.pendingRequests.clear();
        this.cachedRoleKeys.clear();
        if (count > 0) {
            this.logger.log(`Invalidated cache for all roles (${count} keys)`);
        }
    }
}
