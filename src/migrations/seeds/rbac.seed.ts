import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Feature } from '@/modules/rbac/entities/feature.entity';
import { Permission } from '@/modules/rbac/entities/permission.entity';
import { Role } from '@/modules/rbac/entities/role.entity';
import { RolePermission } from '@/modules/rbac/entities/role-permission.entity';
import { User } from '@/modules/rbac/entities/user.entity';

export async function seedRbac(dataSource: DataSource) {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        console.log('🌱 Starting RBAC Seed...');

        const featureRepo = queryRunner.manager.getRepository(Feature);
        const permissionRepo = queryRunner.manager.getRepository(Permission);
        const roleRepo = queryRunner.manager.getRepository(Role);
        const rolePermissionRepo = queryRunner.manager.getRepository(RolePermission);
        const userRepo = queryRunner.manager.getRepository(User);

        const featuresData = [
            { key: 'rbac', name: 'Gerenciamento RBAC', description: 'Gerenciar roles, features e permissões' },
            { key: 'users', name: 'Gerenciamento de Usuários', description: 'Gerenciar usuários do sistema' },
            { key: 'financial', name: 'Dashboard Financeiro', description: 'Acesso a dados financeiros' },
        ];

        const features: Record<string, Feature> = {};

        for (const f of featuresData) {
            let feature = await featureRepo.findOne({ where: { key: f.key } });
            if (!feature) {
                feature = featureRepo.create({ ...f, isActive: true });
                await featureRepo.save(feature);
                console.log(`✅ Feature created: ${f.key}`);
            } else {
                console.log(`ℹ️ Feature already exists: ${f.key}`);
            }
            features[f.key] = feature;
        }

        const permissionsData = [
            { featureKey: 'rbac', action: 'view', name: 'Visualizar' },
            { featureKey: 'rbac', action: 'create', name: 'Criar' },
            { featureKey: 'rbac', action: 'edit', name: 'Editar' },
            { featureKey: 'rbac', action: 'delete', name: 'Deletar' },
            { featureKey: 'rbac', action: 'assign_permissions', name: 'Atribuir Permissões' },
            // Users
            { featureKey: 'users', action: 'view', name: 'Visualizar' },
            { featureKey: 'users', action: 'create', name: 'Criar' },
            { featureKey: 'users', action: 'edit', name: 'Editar' },
            { featureKey: 'users', action: 'delete', name: 'Deletar' },
        ];

        const allPermissions: Permission[] = [];

        for (const p of permissionsData) {
            const feature = features[p.featureKey];
            let permission = await permissionRepo.findOne({
                where: { featureId: feature.id, action: p.action }
            });

            if (!permission) {
                permission = permissionRepo.create({
                    feature,
                    action: p.action,
                    name: p.name,
                    description: `Permissão para ${p.action} em ${feature.name}`
                });
                await permissionRepo.save(permission);
                console.log(`✅ Permission created: ${p.featureKey}:${p.action}`);
            }
            allPermissions.push(permission);
        }

        const rolesData = [
            { name: 'Super Admin', description: 'Acesso total ao sistema' },
            { name: 'Manager', description: 'Gestão de usuários e relatórios' },
            { name: 'Viewer', description: 'Apenas visualização' },
        ];

        const roles: Record<string, Role> = {};

        for (const r of rolesData) {
            let role = await roleRepo.findOne({ where: { name: r.name } });
            if (!role) {
                role = roleRepo.create({ ...r, isActive: true });
                await roleRepo.save(role);
                console.log(`✅ Role created: ${r.name}`);
            }
            roles[r.name] = role;
        }

        const adminRole = roles['Super Admin'];

        await rolePermissionRepo.delete({ roleId: adminRole.id });

        const adminRolePermissions = allPermissions.map(p =>
            rolePermissionRepo.create({
                roleId: adminRole.id,
                permissionId: p.id,
            })
        );

        await rolePermissionRepo.save(adminRolePermissions);
        console.log(`✅ Assigned ${adminRolePermissions.length} permissions to Super Admin`);

        const adminEmail = 'ramosinfo@gmail.com';
        let adminUser = await userRepo.findOne({ where: { email: adminEmail } });

        if (!adminUser) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('Admin@123456', salt);

            adminUser = userRepo.create({
                email: adminEmail,
                password: hashedPassword,
                name: 'System Administrator',
                role: adminRole,
                isActive: true,
            });
            await userRepo.save(adminUser);
            console.log(`✅ Super Admin user created: ${adminEmail}`);
        } else {
            if (adminUser.roleId !== adminRole.id) {
                adminUser.role = adminRole;
                await userRepo.save(adminUser);
                console.log(`ℹ️ Updated Super Admin role linkage`);
            }
            console.log(`ℹ️ Super Admin user already exists`);
        }

        await queryRunner.commitTransaction();
        console.log('✨ Seed completed successfully!');

    } catch (err) {
        console.error('❌ Seed failed:', err);
        await queryRunner.rollbackTransaction();
        throw err;
    } finally {
        await queryRunner.release();
    }
}
