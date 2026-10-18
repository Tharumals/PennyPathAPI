import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { expenseAttachmentsController } from './expense-attachments.controller.js';

// Nested under the expenses resource: /api/v1/expenses/:expenseId/attachments
export async function expenseAttachmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/:expenseId/attachments', expenseAttachmentsController.list);
  app.post('/:expenseId/attachments', expenseAttachmentsController.create);
  app.delete('/:expenseId/attachments/:id', expenseAttachmentsController.remove);
}
