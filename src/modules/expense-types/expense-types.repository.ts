import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { expenseTypes } from '../../db/schema/index.js';
import type {
  CreateExpenseTypeInput,
  UpdateExpenseTypeInput,
} from './expense-types.schema.js';

// Reads include system rows (user_id IS NULL) plus the caller's own custom rows.
// Writes are always scoped to user_id, so system rows can never be mutated.
export const expenseTypesRepository = {
  list(userId: string, categoryId?: string) {
    const visibility = or(
      isNull(expenseTypes.userId),
      eq(expenseTypes.userId, userId),
    );
    return db
      .select()
      .from(expenseTypes)
      .where(
        categoryId
          ? and(visibility, eq(expenseTypes.categoryId, categoryId))
          : visibility,
      )
      .orderBy(asc(expenseTypes.name));
  },

  async find(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(expenseTypes)
      .where(
        and(
          eq(expenseTypes.id, id),
          or(isNull(expenseTypes.userId), eq(expenseTypes.userId, userId)),
        ),
      );
    return row ?? null;
  },

  async create(userId: string, input: CreateExpenseTypeInput) {
    const [row] = await db.insert(expenseTypes).values({ userId, ...input }).returning();
    return row!;
  },

  async update(userId: string, id: string, input: UpdateExpenseTypeInput) {
    const [row] = await db
      .update(expenseTypes)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(expenseTypes.id, id), eq(expenseTypes.userId, userId)))
      .returning();
    return row ?? null;
  },

  async remove(userId: string, id: string) {
    const rows = await db
      .delete(expenseTypes)
      .where(and(eq(expenseTypes.id, id), eq(expenseTypes.userId, userId)))
      .returning({ id: expenseTypes.id });
    return rows.length > 0;
  },
};
