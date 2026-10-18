import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { categoriesController } from './categories.controller.js';

export async function categoriesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', categoriesController.list);
  app.post('/', categoriesController.create);
  app.get('/:id', categoriesController.get);
  app.patch('/:id', categoriesController.update);
  app.delete('/:id', categoriesController.remove);
}
