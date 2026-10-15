import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './shared/errors/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { tasksRoutes } from './modules/tasks/tasks.routes.js';

export async function buildApp() {
  const isDev = env.NODE_ENV === 'development';

  const app = Fastify({
    trustProxy: true,
    logger: {
      level: env.LOG_LEVEL,
      transport: isDev ? { target: 'pino-pretty' } : undefined,
    },
  });

  app.decorateRequest('user', null);
  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

  await app.register(healthRoutes);
  await app.register(usersRoutes, { prefix: '/api/v1/users' });
  await app.register(tasksRoutes, { prefix: '/api/v1/tasks' });

  return app;
}
