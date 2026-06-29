import { IsString, Matches, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldSecureP@ss1', description: 'Current password (re-authentication)' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    example: 'NewSecureP@ss1234',
    description: 'New password (min 12 chars, upper + lower + digit)',
    required: true,
  })
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/, {
    message: 'newPassword must be at least 12 characters and contain upper, lower, and a digit',
  })
  newPassword: string;
}
