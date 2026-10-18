import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { expenseTypesController } from './expense-types.controller.js';

export async function expenseTypesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', expenseTypesController.list);
  app.post('/', expenseTypesController.create);
  app.get('/:id', expenseTypesController.get);
  app.patch('/:id', expenseTypesController.update);
  app.delete('/:id', expenseTypesController.remove);
}
