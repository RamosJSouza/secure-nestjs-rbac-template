import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token of the session to revoke' })
  @IsOptional()
  @IsString()
  refresh_token?: string;
}
