import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../rbac/entities/user.entity';

@Entity('sessions')
@Index(['userId'])
@Index(['refreshTokenHash'])
@Index(['rotatedFromSessionId'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'refresh_token_hash' })
  refreshTokenHash: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'rotated_from_session_id', type: 'uuid', nullable: true })
  rotatedFromSessionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  jti: string | null;
}
