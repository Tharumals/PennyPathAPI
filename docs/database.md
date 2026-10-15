# Database Guidelines

The database is **PostgreSQL on Neon**, accessed through **Drizzle ORM**. Each module owns its tables, and only that module's repository queries them.

**Read this file before:** changing a schema, writing a query, or creating a migration.

## Connection

Use the Neon serverless driver with Drizzle's WebSocket adapter. This adapter supports **transactions**, which payment code needs. (The `neon-http` adapter does not support interactive transactions, so do not use it here.)

```typescript
// db/index.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { env } from "@/config/env";

neonConfig.webSocketConstructor = ws; // needed on Node versions without a global WebSocket

const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle({ client: pool });
```

Only repositories import `db`.

## Schema Conventions

- Define each module's tables in `<module>.schema.ts`
- Table names: plural `snake_case` (`payments`, `payment_methods`)
- Column names: `snake_case` in the database, `camelCase` in TypeScript
- Primary keys: `uuid` with `defaultRandom()`
- Every table has `created_at` and `updated_at` as `timestamptz`
- User-owned tables have a `user_id text not null` column holding the Clerk ID, with an index
- Use `pgEnum` for fixed value sets such as status
- Export inferred types (`$inferSelect`, `$inferInsert`) from the schema

### Example

```typescript
// modules/payments/payments.schema.ts
import {
  pgTable, pgEnum, uuid, text, bigint, char, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const paymentStatus = pgEnum("payment_status", [
  "pending", "completed", "failed", "cancelled", "refunded",
]);
export const paymentDirection = pgEnum("payment_direction", ["incoming", "outgoing"]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    direction: paymentDirection("direction").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(), // e.g. cents
    currency: char("currency", { length: 3 }).notNull(),               // ISO 4217
    description: text("description"),
    idempotencyKey: text("idempotency_key"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("payments_user_created_idx").on(t.userId, t.createdAt),
    index("payments_user_status_idx").on(t.userId, t.status),
    uniqueIndex("payments_user_idempotency_uq").on(t.userId, t.idempotencyKey),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
```

## Money Rules

- Store amounts as **integers in minor units** (cents, pence). Never `float`, `double`, or JS decimals for money
- Always store the **currency code** next to the amount
- Do arithmetic on integers; convert to display format only at the edge
- Be aware that currencies have different minor-unit exponents (USD = 2, JPY = 0). Centralize conversion in one helper

## Queries

1. **Scope by `userId`** in every query on user-owned data (see `docs/authentication.md`)
2. **Exclude soft-deleted rows** (`isNull(payments.deletedAt)`) by default
3. **Select only what you need.** Avoid returning whole rows when a few columns will do
4. **Paginate every list query.** Never return unbounded results
5. **Avoid N+1 queries.** Fetch related data in one query or a batch
6. **Parameterize.** Use Drizzle's builders or the `sql` tag with parameters. Never concatenate user input into SQL

```typescript
// payments.repository.ts
export const paymentsRepository = {
  findById: (id: string, userId: string) =>
    db.query.payments.findFirst({
      where: and(
        eq(payments.id, id),
        eq(payments.userId, userId),
        isNull(payments.deletedAt),
      ),
    }),
};
```

## Transactions

Use a transaction for any operation that writes more than once or must read-then-write consistently. Transactions are started in the **service** layer and the transaction handle is passed to repositories.

```typescript
await db.transaction(async (tx) => {
  const payment = await paymentsRepository.insert(tx, data);
  await paymentEventsRepository.insert(tx, { paymentId: payment.id, type: "created" });
});
```

## Idempotency

The unique index on `(user_id, idempotency_key)` prevents duplicate payments. On insert, handle the unique violation by returning the existing record instead of an error. See `docs/api-conventions.md` for the header.

## Deletion and Audit

- Do **not** hard-delete payment records. Use `deletedAt` or a terminal status
- Record meaningful state changes (status transitions) in an append-only events table so there is an audit trail
- All timestamps are UTC (`timestamptz`)

## Migrations

Configuration:

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/modules/**/*.schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Workflow:

1. Edit the module's `*.schema.ts`
2. `npx drizzle-kit generate` to create a migration
3. **Review the generated SQL** (check for dropped columns and data loss)
4. `npx drizzle-kit migrate` to apply it
5. Commit the migration with the schema change

Rules:

- Never edit a migration that has been applied; add a new one
- `drizzle-kit push` is for throwaway local databases only, never shared or production databases
- Destructive changes (drop column/table) need a two-step rollout: stop using it, then drop it later
- Use **Neon branches** for development and testing so you never experiment on production data

## Checklist

- [ ] Table is defined in the owning module's `*.schema.ts`
- [ ] Only that module's repository queries it
- [ ] User-owned rows have `user_id` and an index covering common filters
- [ ] Money is integer minor units plus currency
- [ ] Migration generated, reviewed, and committed