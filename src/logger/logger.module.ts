import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { RequestMethod } from '@nestjs/common';
import { CorrelationIdModule } from './correlation-id.module';

@Global()
@Module({
  imports: [
    CorrelationIdModule,
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        genReqId: (req: any) => req.correlationId || req.id || randomUUID(),
        serializers: {
          req: (req: any) => ({
            id: req.correlationId || req.id,
            method: req.method,
            url: req.url,
          }),
        },
        customProps: (req: any) => ({
          correlationId: req.correlationId || req.id,
          userId: req.user?.id,
        }),
      },
      forRoutes: ['*'],
      exclude: [
        { method: RequestMethod.ALL, path: 'health' },
      ],
      renameContext: 'service',
    }),
  ],
})
export class LoggerModule {}
