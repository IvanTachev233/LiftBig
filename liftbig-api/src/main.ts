import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { CloudLogger } from './common/cloud-logger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Cloud Run reads JSON log lines; local runs keep Nest's readable text
    logger:
      process.env.NODE_ENV === 'production' ? new CloudLogger() : undefined,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.set('etag', false);
  // Exact deployed web origins, comma-separated (e.g. https://liftbig.web.app)
  const extraOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: [
      'capacitor://localhost',
      'https://localhost',
      'http://localhost:4200',
      'http://localhost:8100',
      ...extraOrigins,
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
