import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// user_id IS NULL  -> predefined/system category (shared by everyone)
// user_id NOT NULL -> custom category created by that user
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive name uniqueness, scoped to system vs per-user custom rows.
    uniqueIndex('uq_categories_system')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.userId} IS NULL`),
    uniqueIndex('uq_categories_user')
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.userId} IS NOT NULL`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
