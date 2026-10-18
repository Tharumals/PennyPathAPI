import { char, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Mirror of Clerk users. Clerk owns authentication; we only store a reference
// (`clerk_user_id`) plus profile preferences used for display/reporting.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(), // e.g. "user_2abc..." from Clerk
  email: text('email'),
  fullName: text('full_name'),
  currency: char('currency', { length: 3 }).notNull().default('LKR'), // ISO 4217
  timezone: text('timezone').notNull().default('Asia/Colombo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
