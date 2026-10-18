# API Conventions (Modular Monolith)

All endpoints follow the conventions below so clients get a predictable API and modules stay independent.

**Read this file before:** adding or changing an endpoint, a request/response shape, error handling, a cross-module call, an event, or a database table.

Related docs: `docs/authentication.md`, `docs/database.md`, `docs/modules.md`

---

## 1. Architecture Rules (Modular Monolith)

The API layer is only one part of a module. These rules keep the monolith modular.

### 1.1 Module layout

```
src/
  modules/
    payments/
      api/             # routes, controllers, Zod DTOs (HTTP only)
      application/     # use cases / services
      domain/          # entities, state machine, domain events
      infra/           # repositories, DB schema, provider adapters
      index.ts         # PUBLIC interface: the only file other modules may import
    ledger/
    notifications/
  shared/              # shared kernel: errors, logger, event bus, types (keep tiny)
  app.ts               # composition root: mounts module routers under /api/v1
```

### 1.2 Boundary rules

- A module may import another module **only through its `index.ts`**. Never import its `api`, `application`, `domain`, or `infra` folders.
- Modules must not read or write another module's tables. No cross-module joins or foreign keys.
- Reference other modules' data by ID, and fetch it through that module's public interface.
- `shared/` contains only technical code (errors, logger, event bus, base types). **No business logic.**
- DTOs are per module and never shared. Never return domain entities directly from controllers.
- Circular dependencies between modules are forbidden. If A and B need each other, the boundary is wrong: merge them, or communicate through events.
- Boundaries are enforced by tooling in CI (see 1.6), not by convention alone.

### 1.3 Data ownership

- Each table is owned by exactly one module.
- Use one database schema per module (`payments.*`, `ledger.*`) and one migrations folder per module.
- For screens that need data from several modules, use a query facade or a dedicated read model. Do not join across schemas.

### 1.4 Communication between modules

| Need | Mechanism |
| --- | --- |
| Immediate answer (e.g. get a balance) | Synchronous call to the other module's public interface |
| Side effect after something happened (notify, post to ledger) | Domain event |

Domain events:

- Named in past tense (`PaymentCompleted`, `PaymentRefunded`).
- Published through the **transactional outbox** (see 1.5), never directly after commit.
- Delivered **at least once**, so every handler must be idempotent.
- Payloads contain IDs and the minimum needed data, not whole entities.
- Event contracts are part of the module's public interface and are versioned.

### 1.5 Transactions and the outbox

- One use case = one database transaction inside one module.
- Never open a transaction that spans two modules' tables.
- Cross-module consistency is achieved with events and the outbox pattern:

```sql
CREATE TABLE payments.outbox (
  id            uuid PRIMARY KEY,
  event_type    text        NOT NULL,
  payload       jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
```

The service writes the state change and the outbox row in the **same transaction**. A relay process reads unpublished rows and dispatches them to the event bus, then sets `published_at`. Consumers record processed event IDs to stay idempotent.

### 1.6 Enforcing boundaries

Use `dependency-cruiser` (or `eslint-plugin-boundaries` / Nx module boundaries) and fail the build on violations.

```js
// .dependency-cruiser.cjs (excerpt)
module.exports = {
  forbidden: [
    {
      name: "no-deep-module-imports",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/([^/]+)/(api|application|domain|infra)/",
        pathNot: "^src/modules/$1/",
      },
    },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "shared-has-no-module-deps",
      severity: "error",
      from: { path: "^src/shared/" },
      to: { path: "^src/modules/" },
    },
  ],
};
```

Add architecture tests for rules that tooling cannot express (for example, "ledger never imports payments").

---

## 2. Basics

- Base path: `/api/v1`
- Format: JSON in and out (`Content-Type: application/json`). Errors use `application/problem+json` (see section 5).
- Resource names: plural, lowercase, kebab-case (`/payments`, `/payment-methods`)
- Each module owns its resource paths. Routes live in the module's `api/*.routes.ts` and are mounted in `app.ts`.
- Auth: required on everything under `/api/v1` except explicitly public routes (see `docs/authentication.md`)
- Identifiers: UUID strings
- Timestamps: ISO 8601 in UTC (`2026-10-15T09:30:00.000Z`)
- Runtime: Node LTS, TypeScript strict mode, **Express 5** (async handler errors reach the error middleware natively; do not use Express 4)

### Standard headers

| Header | Direction | Purpose |
| --- | --- | --- |
| `X-Request-Id` | request / response | Correlation ID. Generated if the client does not send one, always echoed back and logged |
| `Idempotency-Key` | request | Payment-creating endpoints (section 8) |
| `Retry-After` | response | Sent with `429` and `503` |
| `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | response | Rate-limit state |
| `Deprecation`, `Sunset` | response | Deprecated endpoints (section 14) |

---

## 3. Methods and Status Codes

| Action | Method and path | Success |
| --- | --- | --- |
| List | `GET /payments` | `200` |
| Get one | `GET /payments/:id` | `200` |
| Create | `POST /payments` | `201` (+ `Location` header) |
| Partial update | `PATCH /payments/:id` | `200` |
| Delete (non-financial resources only) | `DELETE /payment-methods/:id` | `204` |
| State transition | `POST /payments/:id/cancel` | `200` |

**Financial records (payments, ledger entries) are never deleted.** They change state through explicit transition endpoints (cancel, refund, reverse). See section 9.

| Error | Status | `code` |
| --- | --- | --- |
| Malformed or invalid input | `400` | `VALIDATION_ERROR` |
| Not authenticated | `401` | `UNAUTHORIZED` |
| Authenticated but not permitted | `403` | `FORBIDDEN` |
| Not found (or not yours) | `404` | `NOT_FOUND` |
| Conflict (invalid status transition, duplicate, idempotency mismatch) | `409` | `CONFLICT` |
| Valid syntax but business rule failed | `422` | `BUSINESS_RULE_VIOLATION` |
| Rate limited | `429` | `RATE_LIMITED` |
| Unexpected server error | `500` | `INTERNAL_ERROR` |
| Dependency unavailable | `503` | `SERVICE_UNAVAILABLE` |

`403` vs `404`: if the user must not learn that a resource exists (anything owned by another user), return `404`. Use `403` only when the resource is visible to the user but the action is not allowed (for example, a role lacks permission).

---

## 4. Success Response Shapes

Single:

```json
{ "data": { "id": "…", "amount": 1050, "currency": "USD", "status": "pending" } }
```

List:

```json
{
  "data": [ { "id": "…" } ],
  "meta": { "nextCursor": "eyJ…", "limit": 25 }
}
```

`204` responses have no body.

Never return domain entities or database rows directly. Map them to a response DTO owned by the module.

---

## 5. Error Responses (RFC 9457 Problem Details)

Errors use `application/problem+json` as defined by RFC 9457, plus a stable machine-readable `code`.

```json
{
  "type": "https://api.example.com/problems/validation-error",
  "title": "Request validation failed",
  "status": 400,
  "detail": "One or more fields are invalid",
  "instance": "/api/v1/payments",
  "code": "VALIDATION_ERROR",
  "requestId": "3f1c2a7e-…",
  "errors": [ { "path": "amount", "message": "Expected positive integer" } ]
}
```

- `code` is the stable contract for clients. Never rename it. Values: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `BUSINESS_RULE_VIOLATION`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.
- `title` and `detail` are human-readable and may change.
- `requestId` equals the `X-Request-Id` value.
- Never include stack traces, SQL, internal paths, or provider error bodies.
- Modules may define additional codes in their own error catalog (for example `PAYMENT_ALREADY_REFUNDED`). They must be documented and never reused with a different meaning.

---

## 6. Money in the API

Amounts are **integers in minor units** with an ISO 4217 currency code. Never use floats, in code, JSON, or the database.

```json
{ "amount": 1050, "currency": "USD" }
```

This means 10.50 USD.

- Minor-unit exponent depends on the currency (JPY has 0, KWD has 3). Use a central currency helper, not hard-coded `* 100`.
- Never add or compare amounts of different currencies.
- Use `bigint` (or a decimal library) if values can exceed `Number.MAX_SAFE_INTEGER`. Serialize `bigint` as a string in that case.

---

## 7. Validation

Validate `body`, `params`, and `query` with Zod before anything reaches a service. Never pass raw request data to a service.

```typescript
// modules/payments/api/payments.dto.ts
export const createPaymentSchema = z.object({
  direction: z.enum(["incoming", "outgoing"]),
  amount: z.number().int().positive(),
  currency: z.string().length(3).toUpperCase(),
  description: z.string().max(500).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
```

Use a reusable `validate` middleware so controllers never parse by hand, and always use the **parsed output** (transforms such as `toUpperCase()` are only applied there):

```typescript
// shared/middleware/validate.ts
export const validate =
  (schemas: { body?: ZodType; params?: ZodType; query?: ZodType }): RequestHandler =>
  (req, _res, next) => {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query) Object.defineProperty(req, "query", { value: schemas.query.parse(req.query) });
    next();
  };
```

```typescript
router.post("/payments", validate({ body: createPaymentSchema }), paymentsController.create);
```

A central error handler converts `ZodError` into the `400` problem response above.

Request DTOs and response DTOs are defined per module. OpenAPI documentation is generated from the same Zod schemas (for example with `zod-to-openapi`) so documentation cannot drift from behavior.

---

## 8. Pagination, Filtering, Sorting, Idempotency

### Pagination

- Lists use **cursor-based pagination**: `?limit=25&cursor=<opaque>`
- Default `limit` is 25, maximum is 100
- Cursors are opaque to clients (encode the sort key and ID, optionally signed)
- Return `meta.nextCursor` as `null` when there are no more results
- Sort order must be deterministic (always include the ID as a tiebreaker)

### Filtering and sorting

- Filters are plain query parameters: `?status=completed&from=2026-01-01&to=2026-01-31`
- Sorting: `?sort=createdAt&order=desc`, using a **whitelist** of allowed sort fields
- Every list query is scoped to the authenticated user (or tenant)

### Idempotency

Endpoints that create payments (and other money-moving operations) require an `Idempotency-Key` header.

- Clients send a unique key (UUID) per logical operation and reuse it on retries
- Keys are scoped per user and endpoint, and retained for at least 24 hours
- Stored per key: request hash, status (`in_progress` | `completed`), response status code, and response body
- Same key + same request, completed: return the stored response (same status code and body)
- Same key + same request, still `in_progress`: return `409` with `code: "CONFLICT"` and `Retry-After`
- Same key + different request body: return `409` (`IDEMPOTENCY_KEY_REUSED`)
- Missing key on a payment-creating endpoint: `400`
- Enforced by a unique index on `(user_id, idempotency_key)` (see `docs/database.md`). Insert the `in_progress` row first, in the same transaction as the operation.
- Failed requests with `5xx` release the key so the client can retry. Validation errors (`4xx`) are stored and replayed.

---

## 9. Payment Lifecycle (State Machine)

Payments are immutable financial records. Fields such as `amount`, `currency`, and `direction` never change after creation. Only `status` changes, through allowed transitions.

```
pending ──► processing ──► completed ──► refunded
   │             │              │
   │             ▼              └──► partially_refunded ──► refunded
   │          failed
   ▼
cancelled
```

| From | To | Endpoint |
| --- | --- | --- |
| `pending` | `processing` | internal (provider call) |
| `pending` | `cancelled` | `POST /payments/:id/cancel` |
| `processing` | `completed` / `failed` | internal (provider result or webhook) |
| `completed` | `partially_refunded` / `refunded` | `POST /payments/:id/refunds` |

- The state machine lives in `domain/` and is the only place transitions are decided.
- An invalid transition returns `409` with `code: "CONFLICT"` and a message naming the current status.
- Every transition writes an audit record (who, when, from, to) and emits a domain event through the outbox.
- Never hard-delete or edit amounts. Corrections are made with reversing or refund records.

---

## 10. Errors in Code

Services throw typed errors; one middleware maps them to responses. Express 5 forwards rejected promises from async handlers to this middleware automatically.

```typescript
// shared/errors.ts
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) { super(message); }
}
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") { super(404, "NOT_FOUND", message); }
}
export class UnauthorizedError extends AppError {
  constructor() { super(401, "UNAUTHORIZED", "Authentication required"); }
}
export class ForbiddenError extends AppError {
  constructor(message = "Not permitted") { super(403, "FORBIDDEN", message); }
}
export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") { super(409, code, message); }
}
export class BusinessRuleError extends AppError {
  constructor(message: string, code = "BUSINESS_RULE_VIOLATION") { super(422, code, message); }
}
```

```typescript
// shared/middleware/error-handler.ts
const problem = (req: Request, status: number, code: string, title: string, extra = {}) => ({
  type: `https://api.example.com/problems/${code.toLowerCase().replace(/_/g, "-")}`,
  title,
  status,
  instance: req.originalUrl,
  code,
  requestId: req.id,
  ...extra,
});

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  res.type("application/problem+json");
  if (err instanceof ZodError) {
    return res.status(400).json(
      problem(req, 400, "VALIDATION_ERROR", "Request validation failed", {
        errors: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
    );
  }
  if (err instanceof AppError) {
    return res.status(err.status).json(
      problem(req, err.status, err.code, err.message, err.details ? { errors: err.details } : {}),
    );
  }
  logger.error({ err, requestId: req.id }, "Unhandled error");
  res.status(500).json(problem(req, 500, "INTERNAL_ERROR", "Something went wrong"));
};
```

Modules throw errors from the shared set (or subclasses defined in the module). They never build HTTP responses themselves.

---

## 11. Webhooks (Inbound From Providers)

- Verify the provider signature on the **raw body** before parsing. Reject invalid signatures with `401`.
- Check the timestamp and reject events older than a short window (for example 5 minutes) to prevent replay.
- Deduplicate by provider event ID (unique index) so retries are processed once.
- Acknowledge quickly with `200`, then process asynchronously (queue or outbox).
- Webhook routes are public, so they get their own rate limits and must not share auth middleware with `/api/v1`.

---

## 12. Security Defaults

- Use `helmet` and a restrictive `cors` allow-list
- Add rate limiting, with stricter limits on write and auth endpoints, and return `429` with `Retry-After`
- Set a request body size limit
- Authorization is checked in one place (policy/guard layer), not scattered across handlers. Scoping queries by `userId` is required but is not a substitute for permission checks.
- Never log tokens, secrets, or full payment details (mask card/account numbers)
- Secrets come from environment or a secret manager, never from the repo
- Dependencies are audited in CI

---

## 13. Observability

- Structured JSON logs. Every log line includes `requestId`, `module`, and `userId` (when known).
- Generate or accept `X-Request-Id` in the first middleware and attach it to the logger context.
- OpenTelemetry tracing, with spans for incoming requests, DB calls, cross-module calls, and outbox dispatch.
- Health endpoints outside `/api/v1`: `GET /health/live` (process up) and `GET /health/ready` (DB and critical dependencies reachable).
- Metrics: request rate, latency, error rate per route, outbox lag (oldest unpublished event age).

---

## 14. Versioning and Deprecation

- Version lives in the path (`/api/v1`). A new major version is created only for breaking changes.
- **Non-breaking** (allowed in `v1`): adding optional request fields, adding response fields, adding new endpoints, adding new enum values only if documented that clients must tolerate unknown values.
- **Breaking** (needs a new version): removing or renaming fields or endpoints, changing types, changing meaning or required-ness of a field, tightening validation, changing status codes or error `code` values.
- Deprecated endpoints keep working and return `Deprecation` and `Sunset` headers, and are announced with a minimum notice period.
- Clients must ignore unknown response fields.

---

## 15. Testing

- **Domain:** unit tests for entities and the state machine (no I/O).
- **Module integration:** test each module through its public interface against a real database (for example Testcontainers).
- **API contract:** HTTP tests for status codes, response shapes, error codes, and validation.
- **Boundaries:** dependency-cruiser runs in CI, plus architecture tests.
- **Events:** test that the outbox row is written in the same transaction, and that handlers are idempotent when the same event is delivered twice.
- **Idempotency:** test repeat, concurrent, and different-body requests for the same key.

---

## 16. Adding an Endpoint: Checklist

- [ ] Route lives in the owning module's `api/*.routes.ts` and is mounted under `/api/v1`
- [ ] No imports from another module's internals (only its `index.ts`); `dependency-cruiser` passes
- [ ] Input validated with Zod (body, params, query) via `validate`, using parsed output
- [ ] Controller calls a service/use case; no DB access or business logic in the controller
- [ ] One transaction per use case, inside one module; cross-module effects go through events/outbox
- [ ] Query scoped by `userId` and authorization checked in the policy layer
- [ ] Response mapped to a module-owned DTO using the `{ data }` shape; errors use Problem Details
- [ ] Correct status codes used; `403` vs `404` decided deliberately
- [ ] Money uses integer minor units and a currency code
- [ ] Payment-creating endpoints require `Idempotency-Key`; financial records are never deleted
- [ ] State changes go through the state machine and write audit and outbox records
- [ ] Logs include `requestId`; no sensitive data logged
- [ ] Endpoint documented (OpenAPI generated from schemas) and tests added (domain, module, API, idempotency/events where relevant)