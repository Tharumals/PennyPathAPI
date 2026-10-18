import type { AuthUser } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import { expensesService } from '../expenses/index.js';
import { expenseAttachmentsRepository } from './expense-attachments.repository.js';
import type { CreateAttachmentInput } from './expense-attachments.schema.js';

export const expenseAttachmentsService = {
  async list(user: AuthUser, expenseId: string) {
    // 404 if the expense does not exist or belongs to another user.
    await expensesService.get(user, expenseId);
    return expenseAttachmentsRepository.list(expenseId);
  },

  async create(user: AuthUser, expenseId: string, input: CreateAttachmentInput) {
    await expensesService.get(user, expenseId);
    return expenseAttachmentsRepository.create(expenseId, input);
  },

  async remove(user: AuthUser, expenseId: string, id: string) {
    await expensesService.get(user, expenseId);
    const removed = await expenseAttachmentsRepository.remove(expenseId, id);
    if (!removed) throw new NotFoundError('Attachment not found');
  },
};
