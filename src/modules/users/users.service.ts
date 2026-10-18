import type { AuthUser } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import { usersRepository } from './users.repository.js';
import type { UpdateMeInput } from './users.schema.js';

export const usersService = {
  /**
   * Returns the local user row (uuid primary key referenced by every other
   * module's foreign keys), creating it lazily from the Clerk identity.
   * @param user - The authenticated caller from requireUser()
   * @returns The local users-table row
   */
  async getOrCreate(user: AuthUser) {
    const existing = await usersRepository.findByClerkUserId(user.id);
    if (existing) return existing;

    const created = await usersRepository.create({
      clerkUserId: user.id,
      email: user.email ?? null,
    });
    if (created) return created;

    // Lost the first-request race: the row exists now, re-read it.
    const again = await usersRepository.findByClerkUserId(user.id);
    if (!again) throw new NotFoundError('User not found');
    return again;
  },

  me(user: AuthUser) {
    return this.getOrCreate(user);
  },

  async updateMe(user: AuthUser, input: UpdateMeInput) {
    const row = await this.getOrCreate(user);
    const updated = await usersRepository.update(row.id, input);
    if (!updated) throw new NotFoundError('User not found');
    return updated;
  },
};
