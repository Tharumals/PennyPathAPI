import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { categories } from './categories.js';
import { users } from './users.js';

// e.g. Taxi -> Travel, Lunch -> Food. Same system/custom rule as categories:
// user_id IS NULL -> predefined type, otherwise a custom type owned by that user.
export const expenseTypes = pgTable(
  'expense_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    icon: text('icon'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_types_system')
      .on(t.categoryId, sql`lower(${t.name})`)
      .where(sql`${t.userId} IS NULL`),
    uniqueIndex('uq_types_user')
      .on(t.userId, t.categoryId, sql`lower(${t.name})`)
      .where(sql`${t.userId} IS NOT NULL`),
    index('idx_types_category').on(t.categoryId),
  ],
);

export type ExpenseType = typeof expenseTypes.$inferSelect;
export type NewExpenseType = typeof expenseTypes.$inferInsert;
