import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// `id` is the auth provider's user id (Clerk userId, the `sub` claim in the session token).
// Stored as text: Clerk ids are opaque strings ("user_..."), not UUIDs.
export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(),
  email: text('email'),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
