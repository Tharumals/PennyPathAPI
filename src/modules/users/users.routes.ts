import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { usersController } from './users.controller.js';

export async function usersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/me', usersController.me);
  app.patch('/me', usersController.updateMe);
}
