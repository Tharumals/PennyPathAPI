import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { categories } from '../../db/schema/index.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema.js';

// Reads include system rows (user_id IS NULL) plus the caller's own custom rows.
// Writes are always scoped to user_id, so system rows can never be mutated.
export const categoriesRepository = {
  list(userId: string) {
    return db
      .select()
      .from(categories)
      .where(or(isNull(categories.userId), eq(categories.userId, userId)))
      .orderBy(asc(categories.name));
  },

  async find(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, id),
          or(isNull(categories.userId), eq(categories.userId, userId)),
        ),
      );
    return row ?? null;
  },

  async create(userId: string, input: CreateCategoryInput) {
    const [row] = await db.insert(categories).values({ userId, ...input }).returning();
    return row!;
  },

  async update(userId: string, id: string, input: UpdateCategoryInput) {
    const [row] = await db
      .update(categories)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning();
    return row ?? null;
  },

  async remove(userId: string, id: string) {
    const rows = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning({ id: categories.id });
    return rows.length > 0;
  },
};
