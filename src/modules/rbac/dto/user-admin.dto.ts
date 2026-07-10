import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetUserActiveDto {
  @ApiProperty({ example: false, description: 'Whether the user account is active' })
  @IsBoolean()
  isActive!: boolean;
}
