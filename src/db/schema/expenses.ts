import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { expenseTypes } from './expense-types.js';
import { users } from './users.js';

// Money is stored as numeric(12,2) with the ISO currency code alongside (never float).
// `expense_date` is the user's local day the spend happened; `deleted_at` is a soft delete.
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expenseTypeId: uuid('expense_type_id')
      .notNull()
      .references(() => expenseTypes.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('LKR'), // ISO 4217
    expenseDate: date('expense_date').notNull().default(sql`CURRENT_DATE`),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'), // soft delete
  },
  (t) => [
    check('expenses_amount_check', sql`${t.amount} > 0`),
    // Main index for weekly/monthly/annual reports (soft-deleted rows excluded).
    index('idx_expenses_user_date')
      .on(t.userId, t.expenseDate.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    index('idx_expenses_type').on(t.expenseTypeId),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
