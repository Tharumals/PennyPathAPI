import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { expensesController } from './expenses.controller.js';

export async function expensesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', expensesController.list);
  app.post('/', expensesController.create);
  app.get('/:id', expensesController.get);
  app.patch('/:id', expensesController.update);
  app.delete('/:id', expensesController.remove);
}
