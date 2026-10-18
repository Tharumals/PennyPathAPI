import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { expenses } from '../../db/schema/index.js';
import type {
  CreateExpenseInput,
  ListExpensesQuery,
  UpdateExpenseInput,
} from './expenses.schema.js';

// Every query is scoped by userId AND excludes soft-deleted rows (deleted_at IS NULL),
// so one user can never touch another's rows and deleted expenses vanish everywhere.
export const expensesRepository = {
  list(userId: string, query: ListExpensesQuery) {
    const conditions = [eq(expenses.userId, userId), isNull(expenses.deletedAt)];
    if (query.expenseTypeId) conditions.push(eq(expenses.expenseTypeId, query.expenseTypeId));
    if (query.from) conditions.push(gte(expenses.expenseDate, query.from));
    if (query.to) conditions.push(lte(expenses.expenseDate, query.to));

    return db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  },

  async find(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)));
    return row ?? null;
  },

  async create(userId: string, input: CreateExpenseInput) {
    const [row] = await db.insert(expenses).values({ userId, ...input }).returning();
    return row!;
  },

  async update(userId: string, id: string, input: UpdateExpenseInput) {
    const [row] = await db
      .update(expenses)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
      .returning();
    return row ?? null;
  },

  // Soft delete only: financial records are never hard-deleted (audit trail).
  async softRemove(userId: string, id: string) {
    const now = new Date();
    const [row] = await db
      .update(expenses)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
      .returning({ id: expenses.id });
    return row ?? null;
  },
};
