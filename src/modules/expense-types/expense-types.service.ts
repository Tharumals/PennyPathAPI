import type { AuthUser } from '../auth/auth.middleware.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error.js';
import { categoriesService } from '../categories/index.js';
import { usersService } from '../users/index.js';
import { expenseTypesRepository } from './expense-types.repository.js';
import type {
  CreateExpenseTypeInput,
  ListExpenseTypesQuery,
  UpdateExpenseTypeInput,
} from './expense-types.schema.js';

export const expenseTypesService = {
  async list(user: AuthUser, query: ListExpenseTypesQuery) {
    const local = await usersService.getOrCreate(user);
    return expenseTypesRepository.list(local.id, query.categoryId);
  },

  /**
   * Returns an expense type the caller may read (system or own).
   * Cross-module callers use this to validate an expenseTypeId before creating rows.
   */
  async get(user: AuthUser, id: string) {
    const local = await usersService.getOrCreate(user);
    const expenseType = await expenseTypesRepository.find(local.id, id);
    if (!expenseType) throw new NotFoundError('Expense type not found');
    return expenseType;
  },

  async create(user: AuthUser, input: CreateExpenseTypeInput) {
    // Validate the FK target through the owning module (404/403 surface there),
    // then insert. categoryId is NOT NULL, so this check is mandatory.
    await categoriesService.get(user, input.categoryId);
    const local = await usersService.getOrCreate(user);
    return expenseTypesRepository.create(local.id, input);
  },

  async update(user: AuthUser, id: string, input: UpdateExpenseTypeInput) {
    if (input.categoryId) await categoriesService.get(user, input.categoryId);
    const local = await usersService.getOrCreate(user);
    const updated = await expenseTypesRepository.update(local.id, id, input);
    if (!updated) {
      const visible = await expenseTypesRepository.find(local.id, id);
      if (visible) throw new ForbiddenError('System expense types cannot be modified');
      throw new NotFoundError('Expense type not found');
    }
    return updated;
  },

  async remove(user: AuthUser, id: string) {
    const local = await usersService.getOrCreate(user);
    const removed = await expenseTypesRepository.remove(local.id, id);
    if (!removed) {
      const visible = await expenseTypesRepository.find(local.id, id);
      if (visible) {
        throw new ForbiddenError('System expense types cannot be deleted');
      }
      throw new NotFoundError('Expense type not found');
    }
  },
};
