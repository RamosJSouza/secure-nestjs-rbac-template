import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from "typeorm";
import { Role } from "./role.entity";
import { Session } from '../../auth/entities/session.entity';

@Entity('users')
@Index(['email', 'isActive'])
@Index(['roleId', 'isActive'])
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    @Index()
    email: string;

    @Column({ select: false })
    password: string;

    @Column()
    name: string;

    @ManyToOne(() => Role, role => role.users)
    @JoinColumn({ name: 'role_id' })
    @Index()
    role: Role;

    @Column({ name: 'role_id', nullable: true })
    roleId: string;

    @Column({ default: true })
    @Index()
    isActive: boolean;

    @Column({ name: 'failed_login_attempts', default: 0 })
    failedLoginAttempts: number;

    @Column({ name: 'locked_until', type: 'timestamp', nullable: true })
    lockedUntil: Date | null;

    @OneToMany(() => Session, session => session.user)
    sessions: Session[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date;
}