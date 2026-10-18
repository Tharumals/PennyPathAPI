import type { AuthUser } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import { usersRepository } from './users.repository.js';
import type { UpdateProfileInput } from './users.schema.js';

export const usersService = {
  /** Creates the profile row on first use, then returns it. */
  async getOrCreateProfile(user: AuthUser) {
    const existing = await usersRepository.findById(user.id);
    if (existing) return existing;

    await usersRepository.createIfMissing({ id: user.id, email: user.email });
    const created = await usersRepository.findById(user.id);
    if (!created) throw new NotFoundError('Profile not found');
    return created;
  },

  async updateProfile(user: AuthUser, input: UpdateProfileInput) {
    await this.getOrCreateProfile(user);
    const updated = await usersRepository.update(user.id, input);
    if (!updated) throw new NotFoundError('Profile not found');
    return updated;
  },
};
