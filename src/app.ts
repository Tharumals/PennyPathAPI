import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { clerkPlugin } from '@clerk/fastify';
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

  // Clerk: verifies the Bearer session token and attaches auth state to the request.
  // It does not block unauthenticated requests; the `authenticate` preHandler does.
  // Keys passed explicitly: @clerk/fastify snapshots process.env at module load
  // (possibly before dotenv runs), so we feed it the Zod-validated env instead.
  await app.register(clerkPlugin, {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });

  // Public routes (no authentication): /health, /health/ready, /test.
  // Everything else under /api/v1 applies the `authenticate` preHandler per module.
  await app.register(healthRoutes);
  await app.register(usersRoutes, { prefix: '/api/v1/users' });
  await app.register(tasksRoutes, { prefix: '/api/v1/tasks' });

  return app;
}
