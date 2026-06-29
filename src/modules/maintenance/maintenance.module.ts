import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '@/modules/auth/entities/session.entity';
import { AuditLog } from '@/modules/audit/entities/audit-log.entity';
import { PurgeService } from './purge.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session, AuditLog])],
  providers: [PurgeService],
  exports: [PurgeService],
})
export class MaintenanceModule {}
