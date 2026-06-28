import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.enableShutdownHooks();

  try {
    const configService = app.get(ConfigService);

    app.use(helmet());

    app.enableCors({
      origin: configService.get('ALLOWED_ORIGINS', '').split(','), // Ex: https://admin.example.com
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-Id'],
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    const config = new DocumentBuilder()
      .setTitle('Admin Limify API')
      .setDescription('Enterprise RBAC Administration System')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('auth')
      .addTag('Users')
      .addTag('Roles')
      .addTag('Features')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = configService.get<number>('port') ?? configService.get<number>('PORT') ?? 3000;
    await app.listen(port);

    const logger = app.get(Logger);
    logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
    logger.log(`Swagger Documentation: http://localhost:${port}/api/docs`, 'Bootstrap');
  } catch (error) {
    const logger = app.get(Logger);
    logger.error(
      'Error during application bootstrap',
      error instanceof Error ? error.stack : String(error),
      'Bootstrap',
    );
    process.exit(1);
  }
}

bootstrap();
