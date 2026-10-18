import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { expenseAttachments } from '../../db/schema/index.js';
import type { CreateAttachmentInput } from './expense-attachments.schema.js';

// Ownership is enforced upstream: the service only reaches this layer after the
// parent expense passed expensesService.get() (which scopes by userId).
// These queries scope by expenseId as defense in depth.
export const expenseAttachmentsRepository = {
  list(expenseId: string) {
    return db
      .select()
      .from(expenseAttachments)
      .where(eq(expenseAttachments.expenseId, expenseId))
      .orderBy(desc(expenseAttachments.createdAt));
  },

  async create(expenseId: string, input: CreateAttachmentInput) {
    const [row] = await db
      .insert(expenseAttachments)
      .values({ expenseId, ...input })
      .returning();
    return row!;
  },

  async remove(expenseId: string, id: string) {
    const rows = await db
      .delete(expenseAttachments)
      .where(and(eq(expenseAttachments.id, id), eq(expenseAttachments.expenseId, expenseId)))
      .returning({ id: expenseAttachments.id });
    return rows.length > 0;
  },
};
