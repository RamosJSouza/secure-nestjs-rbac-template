import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { isValidJwtKeyPair } from '@/common/utils/jwt-keys.util';

@Injectable()
export class JwtKeysHealthIndicator {
  constructor(
    private readonly healthIndicator: HealthIndicatorService,
    private readonly configService: ConfigService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const check = this.healthIndicator.check(key);
    const privateKey = this.configService.get<string>('keys.privateKey', '');
    const publicKey = this.configService.get<string>('keys.publicKey', '');

    if (isValidJwtKeyPair(privateKey, publicKey)) {
      return check.up();
    }

    return check.down({ message: 'JWT keypair missing or invalid' });
  }
}
