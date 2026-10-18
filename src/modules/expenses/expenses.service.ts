import type { AuthUser } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import { expenseTypesService } from '../expense-types/index.js';
import { usersService } from '../users/index.js';
import { expensesRepository } from './expenses.repository.js';
import type {
  CreateExpenseInput,
  ListExpensesQuery,
  UpdateExpenseInput,
} from './expenses.schema.js';

export const expensesService = {
  async list(user: AuthUser, query: ListExpensesQuery) {
    const local = await usersService.getOrCreate(user);
    return expensesRepository.list(local.id, query);
  },

  async get(user: AuthUser, id: string) {
    const local = await usersService.getOrCreate(user);
    const expense = await expensesRepository.find(local.id, id);
    if (!expense) throw new NotFoundError('Expense not found');
    return expense;
  },

  async create(user: AuthUser, input: CreateExpenseInput) {
    // Validate the FK target through the owning module (404/403 surface there).
    await expenseTypesService.get(user, input.expenseTypeId);
    const local = await usersService.getOrCreate(user);
    return expensesRepository.create(local.id, {
      ...input,
      currency: input.currency ?? local.currency, // user's default currency
    });
  },

  async update(user: AuthUser, id: string, input: UpdateExpenseInput) {
    if (input.expenseTypeId) await expenseTypesService.get(user, input.expenseTypeId);
    const local = await usersService.getOrCreate(user);
    const updated = await expensesRepository.update(local.id, id, input);
    if (!updated) throw new NotFoundError('Expense not found');
    return updated;
  },

  async remove(user: AuthUser, id: string) {
    const local = await usersService.getOrCreate(user);
    const removed = await expensesRepository.softRemove(local.id, id);
    if (!removed) throw new NotFoundError('Expense not found');
  },
};
