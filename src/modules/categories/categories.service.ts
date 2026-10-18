import type { AuthUser } from '../auth/auth.middleware.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error.js';
import { usersService } from '../users/index.js';
import { categoriesRepository } from './categories.repository.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema.js';

export const categoriesService = {
  /** Lists system categories plus the caller's own custom ones. */
  async list(user: AuthUser) {
    const local = await usersService.getOrCreate(user);
    return categoriesRepository.list(local.id);
  },

  /**
   * Returns a category the caller may read (system or own).
   * Cross-module callers use this to validate a categoryId before creating rows.
   */
  async get(user: AuthUser, id: string) {
    const local = await usersService.getOrCreate(user);
    const category = await categoriesRepository.find(local.id, id);
    if (!category) throw new NotFoundError('Category not found');
    return category;
  },

  /** Creates a custom category owned by the caller. */
  async create(user: AuthUser, input: CreateCategoryInput) {
    const local = await usersService.getOrCreate(user);
    return categoriesRepository.create(local.id, input);
  },

  async update(user: AuthUser, id: string, input: UpdateCategoryInput) {
    const local = await usersService.getOrCreate(user);
    const updated = await categoriesRepository.update(local.id, id, input);
    if (!updated) {
      // Visible but not writable -> 403; not visible at all -> 404 (never leak existence).
      const visible = await categoriesRepository.find(local.id, id);
      if (visible) throw new ForbiddenError('System categories cannot be modified');
      throw new NotFoundError('Category not found');
    }
    return updated;
  },

  async remove(user: AuthUser, id: string) {
    const local = await usersService.getOrCreate(user);
    const removed = await categoriesRepository.remove(local.id, id);
    if (!removed) {
      const visible = await categoriesRepository.find(local.id, id);
      if (visible) {
        throw new ForbiddenError('System categories cannot be deleted');
      }
      throw new NotFoundError('Category not found');
    }
  },
};
