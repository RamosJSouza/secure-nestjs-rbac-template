import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategy/jwt.strategy';
import { AuthController } from './auth.controller';
import { Session } from '@/modules/auth/entities/session.entity';
import { Role } from '@/modules/rbac/entities/role.entity';
import { assertValidJwtKeyPair } from '@/common/utils/jwt-keys.util';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, Role]),
    PassportModule.register({ defaultStrategy: 'jwt', property: 'user', session: false }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const privateKey = configService.get<string>('keys.privateKey');
        const publicKey = configService.get<string>('keys.publicKey');
        if (!privateKey || !publicKey) {
          throw new Error('PRIVATE_KEY and PUBLIC_KEY must be configured (RS256 JWT)');
        }
        assertValidJwtKeyPair(privateKey, publicKey);
        return {
          privateKey,
          publicKey,
          signOptions: { expiresIn: '15m', algorithm: 'RS256' },
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
  controllers: [AuthController],
})
export class AuthModule {}
