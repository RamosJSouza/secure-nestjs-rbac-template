import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldSecureP@ss1', description: 'Current password (re-authentication)' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    minLength: 8,
    example: 'NewSecureP@ss123',
    description: 'New password (min 8 characters)',
    required: true,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}
