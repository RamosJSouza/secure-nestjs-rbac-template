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
import { FeatureController } from './controllers/feature.controller';
import { PermissionController } from './controllers/permission.controller';
import { RoleController } from './controllers/role.controller';

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([
            Feature,
            Permission,
            Role,
            RolePermission,
            User,
        ]),
    ],
    controllers: [
        FeatureController,
        PermissionController,
        RoleController,
    ],
    providers: [
        FeatureService,
        PermissionService,
        RoleService,
        RbacService,
    ],
    exports: [RbacService],
})
export class RbacModule { }
