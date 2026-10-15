import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema/index.js';

export const usersRepository = {
  async findById(id: string) {
    const [row] = await db.select().from(profiles).where(eq(profiles.id, id));
    return row ?? null;
  },

  async createIfMissing(data: { id: string; email?: string }) {
    await db
      .insert(profiles)
      .values({ id: data.id, email: data.email ?? null })
      .onConflictDoNothing();
  },

  async update(id: string, data: { displayName: string }) {
    const [row] = await db
      .update(profiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    return row ?? null;
  },
};
