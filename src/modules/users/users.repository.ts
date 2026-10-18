import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import type { UpdateMeInput } from './users.schema.js';

export const usersRepository = {
  async findByClerkUserId(clerkUserId: string) {
    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    return row ?? null;
  },

  async create(data: { clerkUserId: string; email?: string | null }) {
    // clerk_user_id is unique; two concurrent first requests may race, so the loser
    // gets nothing back and re-reads the winner's row instead of surfacing an error.
    const [row] = await db
      .insert(users)
      .values({ clerkUserId: data.clerkUserId, email: data.email ?? null })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  },

  async update(id: string, data: UpdateMeInput) {
    const [row] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  },
};
