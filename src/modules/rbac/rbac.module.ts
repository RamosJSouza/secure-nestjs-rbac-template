import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feature } from './entities/feature.entity';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { User } from './entities/user.entity';
import { FeatureService } from './services/feature.service';
import { PermissionService } from './services/permission.service';
import { RoleService } from './services/role.service';
import { RbacService } from './services/rbac.service';
import { UserAdminService } from './services/user-admin.service';
import { FeatureController } from './controllers/feature.controller';
import { PermissionController } from './controllers/permission.controller';
import { RoleController } from './controllers/role.controller';
import { UserController } from './controllers/user.controller';
import { AuthModule } from '@/auth/auth.module';
import { UsersModule } from '@/users/users.module';

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([Feature, Permission, Role, RolePermission, User]),
        AuthModule,
        UsersModule,
    ],
    controllers: [FeatureController, PermissionController, RoleController, UserController],
    providers: [FeatureService, PermissionService, RoleService, RbacService, UserAdminService],
    exports: [RbacService],
})
export class RbacModule { }
