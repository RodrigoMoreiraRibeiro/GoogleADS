import 'reflect-metadata';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { FastifyCorsOptions } from '@fastify/cors';

import { AppModule } from '../app.module';
import {
  getApiEnvironment,
  type ApiEnvironment,
} from '../common/config/environment';
import { registerSecurityRequestHooks } from '../common/http/request-identity.hooks';

async function bootstrap(): Promise<void> {
  const env = getApiEnvironment();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: env.LOG_LEVEL,
      },
      trustProxy: env.API_TRUST_PROXY,
      bodyLimit: env.API_REQUEST_BODY_LIMIT_BYTES,
    }),
  );

  registerSecurityRequestHooks(app.getHttpAdapter().getInstance(), env);

  const corsOptions: FastifyCorsOptions = {
    origin: buildCorsOptions(env),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'accept',
      'content-type',
      'x-csrf-token',
      'x-request-id',
      'x-correlation-id',
      'x-requested-with',
    ],
    exposedHeaders: ['x-request-id', 'x-correlation-id'],
    maxAge: 600,
  };

  await app.register(cookie, {
    hook: 'onRequest',
    secret: env.APP_COOKIE_SECRET,
  });

  await app.register(cors, corsOptions);

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: {
      policy: 'same-site',
    },
  });

  app.setGlobalPrefix(env.API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      disableErrorMessages: env.NODE_ENV === 'production',
      stopAtFirstError: true,
      validateCustomDecorators: true,
      transformOptions: {
        enableImplicitConversion: false,
        exposeDefaultValues: false,
      },
    }),
  );
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, env.API_HOST);
}

void bootstrap();

function buildCorsOptions(
  env: ApiEnvironment,
): NonNullable<FastifyCorsOptions['origin']> {
  const allowedOrigin = new URL(env.WEB_BASE_URL).origin;

  return (origin, callback) => {
    if (origin === undefined) {
      callback(null, true);
      return;
    }

    try {
      const normalizedOrigin = new URL(origin).origin;
      callback(null, normalizedOrigin === allowedOrigin);
    } catch {
      callback(null, false);
    }
  };
}
