# API Conventions

All endpoints follow the conventions below so clients get a predictable API.

**Read this file before:** adding or changing an endpoint, a request/response shape, or error handling.

## Basics

- Base path: `/api/v1`
- Format: JSON in and out (`Content-Type: application/json`)
- Resource names: plural, lowercase, kebab-case (`/payments`, `/payment-methods`)
- Auth: required on everything under `/api/v1` (see `docs/authentication.md`)
- Identifiers: UUID strings
- Timestamps: ISO 8601 in UTC (`2026-10-15T09:30:00.000Z`)

## Methods and Status Codes

| Action | Method and path | Success |
| --- | --- | --- |
| List | `GET /payments` | `200` |
| Get one | `GET /payments/:id` | `200` |
| Create | `POST /payments` | `201` |
| Partial update | `PATCH /payments/:id` | `200` |
| Delete (soft) | `DELETE /payments/:id` | `204` |

| Error | Code |
| --- | --- |
| Malformed or invalid input | `400` |
| Not authenticated | `401` |
| Not permitted | `403` |
| Not found (or not yours) | `404` |
| Conflict (e.g. invalid status transition, duplicate) | `409` |
| Unexpected server error | `500` |

## Response Shapes

Success (single):

```json
{ "data": { "id": "…", "amount": 1050, "currency": "USD" } }
```

Success (list):

```json
{
  "data": [ { "id": "…" } ],
  "meta": { "nextCursor": "eyJ…", "limit": 25 }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [ { "path": "amount", "message": "Expected positive integer" } ]
  }
}
```

`code` is a stable machine-readable string (`VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`). `message` is human-readable. Never include stack traces or SQL in responses.

## Money in the API

Amounts are **integers in minor units** with an ISO 4217 currency code. Never use floats.

```json
{ "amount": 1050, "currency": "USD" }
```

This means 10.50 USD.

## Validation

Validate `body`, `params`, and `query` with Zod in the controller. Never pass raw request data to a service.

```typescript
// payments.dto.ts
export const createPaymentSchema = z.object({
  direction: z.enum(["incoming", "outgoing"]),
  amount: z.number().int().positive(),
  currency: z.string().length(3).toUpperCase(),
  description: z.string().max(500).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
```

A central error handler converts `ZodError` into the `400` error shape above.

## Pagination, Filtering, Sorting

- Lists use **cursor-based pagination**: `?limit=25&cursor=<opaque>`
- Default `limit` is 25, maximum is 100
- Filters are plain query parameters: `?status=completed&from=2026-01-01&to=2026-01-31`
- Sorting: `?sort=createdAt&order=desc` (whitelist the allowed sort fields)
- Return `meta.nextCursor` as `null` when there are no more results

## Idempotency

Endpoints that create payments accept an `Idempotency-Key` header.

- Clients send a unique key (e.g. UUID) per logical operation
- Repeating a request with the same key returns the original result instead of creating a duplicate
- Same key with a different body returns `409`
- Enforced by a unique index on `(user_id, idempotency_key)` (see `docs/database.md`)

## Errors in Code

Services throw typed errors; one middleware maps them to responses.

```typescript
// shared/errors
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
export class ConflictError extends AppError {
  constructor(message: string) { super(409, "CONFLICT", message); }
}
```

```typescript
// shared/middleware/error-handler.ts
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
```

Express 4 does not catch rejected promises from async handlers on its own. Use Express 5 or wrap handlers so errors reach the error middleware.

## Security Defaults

- Use `helmet` and a restrictive `cors` allow-list
- Add rate limiting, with stricter limits on write endpoints
- Set a request body size limit
- Never log tokens, secrets, or full payment details

## Adding an Endpoint: Checklist

- [ ] Route lives in the owning module's `*.routes.ts` and is mounted under `/api/v1`
- [ ] Input validated with Zod (body, params, query)
- [ ] Controller calls a service; no DB access or business logic in the controller
- [ ] Query scoped by `userId`
- [ ] Response uses the `{ data }` / `{ error }` shapes
- [ ] Correct status codes used
- [ ] Money uses integer minor units and a currency code
- [ ] Endpoint documented (OpenAPI or this folder) and tests added