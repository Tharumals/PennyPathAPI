import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { tasksController } from './tasks.controller.js';

export async function tasksRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', tasksController.list);
  app.post('/', tasksController.create);
  app.get('/:id', tasksController.get);
  app.patch('/:id', tasksController.update);
  app.delete('/:id', tasksController.remove);
}
