import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'User full name',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    example: 'P@ssw0rd1234',
    description: 'User password (min 12 chars, upper + lower + digit)',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/, {
    message: 'password must be at least 12 characters and contain upper, lower, and a digit',
  })
  password: string;

  @ApiPropertyOptional({ example: 'uuid-of-role', description: 'Role to assign. Defaults to "Viewer".' })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}
