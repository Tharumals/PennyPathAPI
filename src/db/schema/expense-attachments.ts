import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { expenses } from './expenses.js';

// Receipt images live in object storage (S3 / R2 / Cloudinary / UploadThing);
// the DB stores only the reference + metadata.
export const expenseAttachments = pgTable(
  'expense_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(), // path/key in your bucket
    url: text('url'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'`), // e.g. future OCR results
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_attachments_expense').on(t.expenseId)],
);

export type ExpenseAttachment = typeof expenseAttachments.$inferSelect;
export type NewExpenseAttachment = typeof expenseAttachments.$inferInsert;
