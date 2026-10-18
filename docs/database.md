# Database Guidelines

The database is **PostgreSQL on Neon**, accessed through **Drizzle ORM**. Each module owns its own Postgres schema and tables, and only that module's repository queries them.

**Read this file before:** changing a schema, writing a query, writing a transaction, or creating a migration.

Related docs: `docs/architecture-guidelines.md` (module boundaries, outbox), `docs/api-conventions.md` (money, idempotency, payment lifecycle), `docs/authentication.md` (`userId` scoping)

## Principles

1. **One module owns each table.** No other module reads or writes it. No cross-module joins or foreign keys.
2. **The database enforces what it can.** Constraints (NOT NULL, CHECK, UNIQUE, FK within a module) are the last line of defense behind application code.
3. **Financial data is append-only in spirit.** Payments are never deleted or have their amounts edited. State changes are recorded as events.
4. **Every query is scoped to its owner** (`user_id`, plus tenant if used).
5. **Migrations are forward-only and safe to deploy while the old version still runs.**
6. **Keep transactions short and inside one module.**

## Connection

### Two connection strings

| Variable | Endpoint | Used by |
| --- | --- | --- |
| `DATABASE_URL` | Neon **pooled** endpoint (PgBouncer) | The running application |
| `DATABASE_URL_DIRECT` | Neon **direct** endpoint | Migrations, one-off scripts, anything needing session features |

Both are validated in `config/env.ts`. Use `sslmode=require` (Neon default).

### Driver

Use the Neon serverless driver with Drizzle's **WebSocket** adapter (`neon-serverless`). It supports interactive **transactions**, which payment code needs. The `neon-http` adapter does not support interactive transactions, so do not use it here.

```typescript
// db/index.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { env } from "@/config/env";
import { logger } from "@/shared/logger";

neonConfig.webSocketConstructor = ws; // needed on Node versions without a global WebSocket

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,               // size to your Neon compute limits and instance count
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,    // fail fast, also covers cold starts of a suspended compute
});
pool.on("error", (err) => logger.error({ err }, "Unexpected pool error"));

export const db = drizzle({ client: pool }); // no global schema object on purpose (see "Queries")

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
```

Rules:

- Only repositories (and the migration tooling) import `db`.
- This is a long-running Node server, so one shared `Pool` per process is correct. Do not create pools per request.
- Total connections = `max` x number of app instances. Keep it below the limits of your Neon compute and pooler.
- The Neon pooler runs in **transaction mode**. Do not rely on session state across statements: no session-level `SET`, no session advisory locks, no `LISTEN/NOTIFY`. Use `SET LOCAL` and `pg_advisory_xact_lock` inside a transaction, or the direct endpoint if you truly need session features.
- Neon computes can scale to zero. Expect occasional connection latency after idle periods and keep sensible timeouts and retries on startup. A polling outbox relay keeps the compute awake, which is usually acceptable in production but worth knowing for dev branches.

### Database roles (least privilege)

| Role | Privileges | Used for |
| --- | --- | --- |
| `app` | `SELECT/INSERT/UPDATE` (and `DELETE` only where allowed) on module schemas. No DDL | `DATABASE_URL` |
| `migrator` | DDL on module schemas | `DATABASE_URL_DIRECT`, CI/deploy step only |

Optional hardening: one role per module with grants only on that module's schema, so a boundary violation fails at runtime too. For append-only tables (audit events), grant `INSERT` and `SELECT` only.

## Schema Organization

- **One Postgres schema per module** (`payments`, `ledger`, ...) declared with `pgSchema`. Ownership is then visible in the database itself.
- Define each module's tables in `modules/<module>/infra/<module>.schema.ts`.
- Foreign keys are allowed **inside** a module. Never to another module's schema. Reference other modules by plain ID columns.
- Export inferred types (`$inferSelect`, `$inferInsert`) from the schema file, but keep them **internal**. Public module contracts expose DTOs, not table types (see `architecture-guidelines.md`).

## Schema Conventions

- Table names: plural `snake_case` (`payments`, `payment_methods`)
- Column names: `snake_case` in the database, `camelCase` in TypeScript
- Primary keys: `uuid` with `defaultRandom()`. (Time-ordered UUIDs such as UUIDv7, generated in the app, give better index locality on large tables. Either is acceptable. Pick one and stay consistent.)
- Every table has `created_at` and `updated_at` as `timestamptz` (UTC)
- User-owned tables have `user_id text not null` holding the **Clerk ID** (strings like `user_2abc...`, never `uuid`), with an index
- Use **CHECK constraints** for invariants (positive amounts, currency format)
- Fixed value sets (status): `pgEnum` scoped to the module schema. Adding a value is cheap, but removing or renaming one is painful. For sets that change often, prefer `text` plus a CHECK constraint
- Mark columns `NOT NULL` unless null has a real meaning
- Add a `version integer not null default 1` column to rows that go through state transitions (optimistic concurrency)

### Example

```typescript
// modules/payments/infra/payments.schema.ts
import { sql } from "drizzle-orm";
import {
  pgSchema, uuid, text, bigint, char, integer, jsonb, timestamp,
  index, uniqueIndex, check,
} from "drizzle-orm/pg-core";

export const paymentsSchema = pgSchema("payments");

export const paymentStatus = paymentsSchema.enum("payment_status", [
  "pending", "processing", "completed", "failed",
  "cancelled", "partially_refunded", "refunded",
]);
export const paymentDirection = paymentsSchema.enum("payment_direction", ["incoming", "outgoing"]);

export const payments = paymentsSchema.table(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    direction: paymentDirection("direction").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(), // minor units, e.g. cents
    currency: char("currency", { length: 3 }).notNull(),               // ISO 4217
    description: text("description"),
    version: integer("version").notNull().default(1),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // Matches cursor pagination: WHERE user_id = ? ORDER BY created_at DESC, id DESC
    index("payments_user_created_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
    index("payments_user_status_idx").on(t.userId, t.status),
    check("payments_amount_valid", sql`${t.amountMinor} > 0 AND ${t.amountMinor} <= 9007199254740991`),
    check("payments_currency_valid", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

// Append-only audit trail of every state change
export const paymentEvents = paymentsSchema.table(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id), // same module: FK allowed
    userId: text("user_id").notNull(),
    type: text("type").notNull(),                 // 'created' | 'status_changed' | ...
    fromStatus: paymentStatus("from_status"),
    toStatus: paymentStatus("to_status"),
    actorId: text("actor_id"),                    // who triggered it (user, system, provider)
    requestId: text("request_id"),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_events_payment_idx").on(t.paymentId, t.createdAt)],
);

// Idempotency records (see docs/api-conventions.md)
export const idempotencyKeys = paymentsSchema.table(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),   // hash of method + path + body
    status: text("status").notNull(),              // 'in_progress' | 'completed'
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("idempotency_user_key_uq").on(t.userId, t.key),
    index("idempotency_expires_idx").on(t.expiresAt), // for the cleanup job
  ],
);

// Transactional outbox (see docs/architecture-guidelines.md)
export const outbox = paymentsSchema.table(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [index("outbox_unpublished_idx").on(t.createdAt).where(sql`${t.publishedAt} IS NULL`)],
);

export type PaymentRow = typeof payments.$inferSelect;
export type NewPaymentRow = typeof payments.$inferInsert;
```

Notes:

- **No `deletedAt` on payments.** Financial records are never deleted. They end in a terminal status (`cancelled`, `refunded`) and the history lives in `payment_events`. Non-financial tables (for example saved payment methods) may use `deletedAt` soft delete, and every query on them must filter it.
- Idempotency lives in its own table so it can store the request hash and the response, and be cleaned up after `expires_at` without touching payments.
- The audit table is append-only: grant the app role `INSERT` and `SELECT` only.

## Money Rules

- Store amounts as **integers in minor units** (cents, pence). Never `float`, `double precision`, `numeric` for arithmetic in JS, or JS decimals for money
- Always store the **currency code** next to the amount (`char(3)`, uppercase, validated by CHECK)
- Do arithmetic on integers. Convert to display format only at the edge
- Currencies have different minor-unit exponents (USD = 2, JPY = 0, KWD = 3). Centralize conversion in one helper
- `bigint` in `mode: "number"` is safe up to `Number.MAX_SAFE_INTEGER`. The CHECK constraint above enforces that limit. If you ever need larger values, switch to `mode: "bigint"` and serialize as strings
- Never add, subtract, or compare amounts of different currencies
- Never store raw card numbers or CVV. Store only provider tokens and non-sensitive display fields (last 4, brand)

## Queries

1. **Scope by owner.** Every query on user-owned data includes `user_id` (see `docs/authentication.md`). This applies to updates and deletes too
2. **Use the core query builder** (`db.select().from(table)`, `insert`, `update`) in repositories. Avoid the relational `db.query.*` API: it needs one global schema object that imports every module's tables, which breaks module boundaries
3. **Select only the columns you need.** No `select *` for hot paths
4. **Paginate every list query** with keyset (cursor) pagination. Avoid `OFFSET`
5. **Avoid N+1 queries.** Fetch related data in one query or a batch (`inArray`)
6. **Parameterize.** Use Drizzle's builders or the `sql` tag with parameters. Never concatenate user input into SQL
7. **Bound everything.** Maximum page size 100, bounded `IN` lists, `LIMIT` on any query that could grow
8. **Repository methods accept `DbOrTx`** as the first argument so they work inside and outside transactions
9. **Map rows to DTOs** at the module boundary. Rows never leave the module

```typescript
// modules/payments/infra/payments.repository.ts
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { payments } from "./payments.schema";

export const paymentsRepository = {
  findById: async (db: DbOrTx, id: string, userId: string) => {
    const [row] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  // Keyset pagination: stable, index-friendly, no OFFSET
  list: (db: DbOrTx, userId: string, limit: number, cursor?: { createdAt: Date; id: string }) =>
    db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.userId, userId),
          cursor
            ? or(
                lt(payments.createdAt, cursor.createdAt),
                and(eq(payments.createdAt, cursor.createdAt), lt(payments.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(limit + 1), // fetch one extra row to know whether a next page exists

  // Guarded state transition: only succeeds from the expected current status
  transition: async (
    db: DbOrTx,
    args: { id: string; userId: string; from: PaymentStatus; to: PaymentStatus },
  ) => {
    const [row] = await db
      .update(payments)
      .set({ status: args.to, version: sql`${payments.version} + 1` })
      .where(
        and(eq(payments.id, args.id), eq(payments.userId, args.userId), eq(payments.status, args.from)),
      )
      .returning();
    return row ?? null; // null = not found OR wrong state; the service decides 404 vs 409
  },
};
```

### Handling database errors

Map known Postgres error codes to typed application errors in the repository or service. Never let raw database errors reach clients.

| Code | Meaning | Map to |
| --- | --- | --- |
| `23505` | unique violation | `ConflictError` (or return the existing record for idempotency) |
| `23503` | foreign key violation | `BusinessRuleError` / `NotFoundError` |
| `23514` | check violation | `BusinessRuleError` |
| `40001` / `40P01` | serialization failure / deadlock | Retry the transaction |
| `57014` | statement timeout | `503` and log |

```typescript
const pgCode = (e: unknown) => (e as any)?.code ?? (e as any)?.cause?.code; // driver or ORM may wrap errors
```

## Transactions

Use a transaction for any operation that writes more than once or must read-then-write consistently. Transactions are started in the **service** layer and the transaction handle is passed to repositories.

```typescript
await db.transaction(async (tx) => {
  const payment = await paymentsRepository.insert(tx, data);
  await paymentEventsRepository.insert(tx, { paymentId: payment.id, userId, type: "created" });
  await outboxRepository.insert(tx, "payment.created.v1", { paymentId: payment.id, userId });
});
```

Rules:

- **One transaction = one module.** Never write to two modules' tables in one transaction. Cross-module effects go through the **outbox** in the same transaction as the state change
- **Keep them short.** No HTTP calls to providers, no sleeps, no user waits inside a transaction
- **Concurrency on state changes:** use the guarded `UPDATE ... WHERE status = <expected>` shown above (or `SELECT ... FOR UPDATE` when you must read first) and check that a row was affected
- **Retry** serialization failures and deadlocks (`40001`, `40P01`) a small bounded number of times with backoff. Wrap this in one shared helper
- Use the default `READ COMMITTED` isolation unless you have a specific reason. If you use `SERIALIZABLE`, you must have retry logic
- Set `statement_timeout`, `lock_timeout`, and `idle_in_transaction_session_timeout` at the role or connection level so stuck queries cannot hold locks forever
- Outbox relay: claim rows with `FOR UPDATE SKIP LOCKED` inside a transaction so multiple instances can run safely

## Idempotency

- The `idempotency_keys` table with a unique index on `(user_id, key)` guarantees one record per client key
- Flow: insert the key as `in_progress` **in the same transaction** as the operation, store the response when done, and replay it for repeats. Rules for conflicts, retention, and error handling are in `docs/api-conventions.md`
- On a unique violation (`23505`) read the existing record: same request hash and completed means replay the stored response, different hash means `409`, still `in_progress` means `409` with `Retry-After`
- Run a periodic job that deletes rows past `expires_at`

## Deletion, Retention, and Privacy

- **Never hard-delete payment or ledger records.** Use terminal statuses and the event trail
- Append-only tables (events, ledger entries) are never updated. Corrections are new rows
- When a user is deleted (Clerk `user.deleted`), keep financial rows keyed by the opaque `user_id`, and **remove or anonymize personal data** (names, emails, free-text fields that may contain PII). Document retention periods per table
- Do not put personal data in `jsonb` blobs "for convenience". It is hard to find and anonymize later
- Limit PII in logs. Never log query parameters for sensitive tables

## Performance

- Design indexes from real query patterns. A composite index should match the `WHERE` columns first, then the `ORDER BY` columns
- Use **partial indexes** for hot subsets (for example unpublished outbox rows)
- Every foreign key column used in joins or deletes gets an index
- Check plans with `EXPLAIN (ANALYZE, BUFFERS)` on realistic data before merging queries on large tables
- Enable `pg_stat_statements` (available on Neon) and review the slowest queries regularly
- Batch inserts instead of looping single inserts
- Create indexes on large existing tables with `CREATE INDEX CONCURRENTLY`. This cannot run inside a transaction, so apply it as a separate, manually reviewed migration step
- Log query duration with the `module` field and alert on slow or failing queries

## Migrations

### Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/modules/*/infra/*.schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  schemaFilter: ["payments", "ledger", "notifications"], // list every module schema
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT! }, // direct endpoint, never the pooler
  strict: true,
  verbose: true,
});
```

### Workflow

1. Edit the module's `*.schema.ts`
2. `npx drizzle-kit generate --name <module>_<change>` (for example `payments_add_refunds`)
3. **Review the generated SQL**: look for dropped columns, type changes, table rewrites, and missing indexes
4. `npx drizzle-kit migrate` against your own Neon dev branch to apply it
5. Commit the migration with the schema change

### Rules

- **A migration touches one module's schema.** If a change spans modules, split it into one migration per module
- Never edit a migration that has been applied. Add a new one
- Migrations are **forward-only**. To undo something, write a new migration
- `drizzle-kit push` is for throwaway local databases only, never shared or production databases
- **Backward compatible deploys (expand and contract):** the old app version keeps running while the migration applies, so a change must work with both versions
  - Add columns as nullable or with a default, deploy code that uses them, then tighten later
  - Never drop or rename a column or table in the same release that stops using it. Stop using it, release, then drop in a later migration
  - Backfill large tables in batches outside the migration transaction
- Add constraints safely on big tables: create them as `NOT VALID`, then `VALIDATE CONSTRAINT` in a later step
- Set a `lock_timeout` for DDL so a migration fails fast instead of blocking traffic
- Migrations run in a **dedicated deploy step** (CI/CD) with the `migrator` role over the direct connection. Do not run them automatically on app startup when several instances boot at once
- CI checks: (1) migrations apply cleanly to an empty Neon branch, (2) `drizzle-kit generate` produces **no diff** (schema and migrations are in sync), (3) boundary rules pass
- Before risky migrations, test them on a Neon branch created from production data (masked if it contains PII), and note the point-in-time restore window in the runbook

## Neon Practices

- **Branches:** one per developer or per pull request for testing. CI creates a short-lived branch, runs migrations and tests, then deletes it. Never experiment on the production branch
- Branches created from production contain production data. Mask or exclude PII before sharing them
- Use the pooled endpoint for the app and the direct endpoint for migrations (see Connection)
- Rely on Neon's point-in-time restore for recovery, and **practice a restore** at least once so you know the procedure
- Protect the production branch (restricted access, no ad-hoc writes). Make manual data fixes through reviewed scripts that run in a transaction

## Testing

| Level | Approach |
| --- | --- |
| Repository tests | Real Postgres (Testcontainers or a Neon branch) with migrations applied. Do not mock the database |
| Constraints | Test that CHECK, UNIQUE, and FK rules actually reject bad data |
| Ownership | Test that user A's queries never return or modify user B's rows |
| Concurrency | Test double-submit, concurrent state transitions, and idempotent retries |
| Migrations | Apply the full migration history to an empty database in CI |

Use one transaction per test with rollback, or truncate between tests. Build test data with factories, not shared fixtures.

## Checklist

- [ ] Table is defined in the owning module's `infra/*.schema.ts`, inside that module's Postgres schema
- [ ] Only that module's repository queries it, using the core query builder
- [ ] No foreign key or join to another module's tables
- [ ] User-owned rows have `user_id text not null` and an index matching the common filter and sort
- [ ] Money is integer minor units plus a currency code, with CHECK constraints
- [ ] Financial tables have no delete path. State changes write to an append-only events table
- [ ] Every query is scoped by owner (reads, updates, and deletes)
- [ ] List queries use keyset pagination with a bounded `limit`
- [ ] Multi-step writes use a single-module transaction, with cross-module effects via the outbox
- [ ] State transitions are guarded (`WHERE status = expected`) and affected rows are checked
- [ ] Migration generated with a module-prefixed name, reviewed, backward compatible, and committed
- [ ] Migration applied and tested on a Neon branch, and CI shows no schema drift
- [ ] Repository, constraint, and ownership tests added