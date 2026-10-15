import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { tasks } from '../../db/schema/index.js';
import type { CreateTaskInput, UpdateTaskInput } from './tasks.schema.js';

// Every query is scoped by userId, so one user can never touch another's rows.
export const tasksRepository = {
  list(userId: string) {
    return db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.createdAt));
  },

  async find(userId: string, id: string) {
    const [row] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return row ?? null;
  },

  async create(userId: string, input: CreateTaskInput) {
    const [row] = await db.insert(tasks).values({ userId, ...input }).returning();
    return row!;
  },

  async update(userId: string, id: string, input: UpdateTaskInput) {
    const [row] = await db
      .update(tasks)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return row ?? null;
  },

  async remove(userId: string, id: string) {
    const rows = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning({ id: tasks.id });
    return rows.length > 0;
  },
};
