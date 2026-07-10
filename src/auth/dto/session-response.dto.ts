import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ example: '31d45fbd-2b4b-4922-a653-7af171d3908d' })
  id: string;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  ip: string | null;

  @ApiPropertyOptional({ example: 'Mozilla/5.0' })
  userAgent: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  expiresAt: Date;
}
