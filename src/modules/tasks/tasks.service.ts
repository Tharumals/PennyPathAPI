import type { AuthUser } from '../auth/auth.service.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import { usersService } from '../users/users.service.js'; // modules talk via services, not repositories
import { tasksRepository } from './tasks.repository.js';
import type { CreateTaskInput, UpdateTaskInput } from './tasks.schema.js';

export const tasksService = {
  list(user: AuthUser) {
    return tasksRepository.list(user.id);
  },

  async get(user: AuthUser, id: string) {
    const task = await tasksRepository.find(user.id, id);
    if (!task) throw new NotFoundError('Task not found');
    return task;
  },

  async create(user: AuthUser, input: CreateTaskInput) {
    await usersService.getOrCreateProfile(user); // ensure FK target exists
    return tasksRepository.create(user.id, input);
  },

  async update(user: AuthUser, id: string, input: UpdateTaskInput) {
    const task = await tasksRepository.update(user.id, id, input);
    if (!task) throw new NotFoundError('Task not found');
    return task;
  },

  async remove(user: AuthUser, id: string) {
    const removed = await tasksRepository.remove(user.id, id);
    if (!removed) throw new NotFoundError('Task not found');
  },
};
