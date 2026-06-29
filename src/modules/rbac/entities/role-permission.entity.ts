import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, Unique } from "typeorm";
import { Role } from "./role.entity";
import { Permission } from "./permission.entity";

@Entity('role_permissions')
@Unique(['roleId', 'permissionId'])
@Index(['roleId', 'permissionId'])
export class RolePermission {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Role, role => role.rolePermissions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'role_id' })
    @Index()
    role: Role;

    @Column({ name: 'role_id' })
    roleId: string;

    @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'permission_id' })
    @Index()
    permission: Permission;

    @Column({ name: 'permission_id' })
    permissionId: string;

    @CreateDateColumn()
    createdAt: Date;
}