import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { resolveCorsOrigin } from './common/cors';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: resolveCorsOrigin(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  const config = new DocumentBuilder()
    .setTitle('ProFootball Real-Time Match API')
    .setDescription('REST, WebSocket, and SSE API for simulated football matches.')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('/api/docs', app, SwaggerModule.createDocument(app, config));

  // Friendly welcome on the root URL.
  app.getHttpAdapter().get('/', (_req, res: any) =>
    res.json({
      name: 'ProFootball Real-Time Match API',
      version: '0.1.0',
      docs: {
        rest: '/api/docs',
        events: '/api/events-docs',
      },
      health: '/health',
      message:
        'Welcome! Visit /api/docs for interactive REST documentation ' +
        'or /api/events-docs for the WebSocket & SSE event reference.',
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
