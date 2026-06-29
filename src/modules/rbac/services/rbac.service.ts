import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { RolePermission } from '../entities/role-permission.entity';

@Injectable()
export class RbacService {
    private readonly logger = new Logger(RbacService.name);
    private readonly ttl: number;
    private readonly pendingRequests = new Map<string, Promise<string[]>>();

    constructor(
        @InjectRepository(RolePermission)
        private rolePermissionRepository: Repository<RolePermission>,
        @Inject(CACHE_MANAGER)
        private cacheManager: Cache,
        private configService: ConfigService,
    ) {
        this.ttl = this.configService.get<number>('RBAC_CACHE_TTL', 300000);
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
            return requiredPermissions.every(perm => userPermissions.includes(perm));
        } catch (error) {
            this.logger.error(`Critical RBAC error for role ${roleId}`, error.stack);
            return false;
        }
    }

    async getPermissionsForRole(roleId: string): Promise<string[]> {
        const cacheKey = `rbac:role:${roleId}:permissions`;

        try {
            const cached = await this.cacheManager.get<string[]>(cacheKey);
            if (cached) {
                return cached;
            }
        } catch (error) {
            this.logger.warn(`Redis cache get failed for ${cacheKey}, falling back to DB`, error.message);
        }

        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey)!;
        }

        const fetchPromise = (async () => {
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

                this.cacheManager.set(cacheKey, permissions, this.ttl).catch(err => {
                    this.logger.warn(`Redis cache set failed for ${cacheKey}`, err.message);
                });

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
        this.pendingRequests.delete(cacheKey);

        try {
            await this.cacheManager.del(cacheKey);
            this.logger.log(`Invalidated cache for role ${roleId}`);
        } catch (error) {
            this.logger.error(`Failed to invalidate cache for role ${roleId}`, error.stack);
        }
    }
}
