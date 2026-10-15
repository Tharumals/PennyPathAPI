# Authentication Guidelines

Authentication uses **Clerk** via `@clerk/express`. Clients send a Clerk session token; the API verifies it and identifies the user by their Clerk `userId`.

**Read this file before:** implementing auth, protecting routes, accessing user data, or handling webhooks.

## Core Principles

1. **Deny by default.** Every route requires authentication unless it is explicitly allow-listed as public.
2. **The server decides identity.** Never accept `userId` from the request body, query, or params as proof of identity.
3. **Scope every query by `userId`.** A user must only ever read or change their own data.
4. **Authorize in the service layer**, not only at the route.

## Setup

### Environment variables

```
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

### Middleware order in `app.ts`

```typescript
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { requireUser } from "@/shared/middleware/require-user";
import { paymentsRouter } from "@/modules/payments";

const app = express();

app.use(express.json());
app.use(clerkMiddleware());               // 1. Parses and verifies the session token

app.get("/health", (_req, res) => {       // 2. Public routes BEFORE the guard
  res.json({ status: "ok" });
});

app.use("/api/v1", requireUser);          // 3. Everything under /api/v1 requires a user
app.use("/api/v1/payments", paymentsRouter);
```

### The auth guard

Do not use Clerk's `requireAuth()` for an API: it redirects unauthenticated requests to a sign-in page. Return a `401` instead.

```typescript
// shared/middleware/require-user.ts
import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { UnauthorizedError } from "@/shared/errors";

export const requireUser: RequestHandler = (req, _res, next) => {
  const { userId } = getAuth(req);
  if (!userId) return next(new UnauthorizedError());
  next();
};

/** Returns the authenticated user's Clerk ID. Only call behind requireUser. */
export const getUserId = (req: Request): string => {
  const { userId } = getAuth(req);
  if (!userId) throw new UnauthorizedError();
  return userId;
};
```

## Using the User ID

Controllers extract the ID and pass it down. Services and repositories take `userId` as an explicit parameter.

```typescript
// controller
const payment = await paymentsService.getById(getUserId(req), req.params.id);

// repository: ownership is part of the query itself
findById: (id: string, userId: string) =>
  db.query.payments.findFirst({
    where: and(eq(payments.id, id), eq(payments.userId, userId)),
  }),
```

Every repository method that reads or writes user-owned data must require `userId`. If a method doesn't take it, that is a red flag.

## Status Codes

| Situation | Response |
| --- | --- |
| No or invalid token | `401 Unauthorized` |
| Authenticated, but action not permitted (e.g. role) | `403 Forbidden` |
| Resource belongs to another user | `404 Not Found` (do not reveal it exists) |

## Public Routes

Public routes must be registered before the `requireUser` guard and listed here:

- `GET /health`
- [ADD OTHERS EXPLICITLY, e.g. webhook endpoints]

Adding a public route requires a comment in `app.ts` explaining why.

## Clerk Webhooks (if used)

If you sync Clerk events (e.g. `user.deleted`) into your database:

- Mount the webhook route **before** `express.json()` so you can verify the signature against the raw body
- Verify the signature (Clerk uses Svix) before processing anything
- Make handlers idempotent; webhooks can be delivered more than once
- Do not put webhook routes behind `requireUser`

## Roles and Organizations (optional)

If you need roles, read them from the verified session claims via `getAuth(req)` and check them in the **service layer**. Never trust role values sent by the client.

## Security Checklist

- [ ] New route is under `/api/v1` (protected) or deliberately public and documented
- [ ] Every user-data query is scoped by `userId`
- [ ] No `userId` is read from `req.body`, `req.query`, or `req.params` for identity
- [ ] Secrets are read from env, never hard-coded or logged
- [ ] Error responses do not reveal whether another user's resource exists

## Testing Auth

- Test that a request without a token returns `401`
- Test that user A cannot read, update, or delete user B's records (expect `404`)
- Mock `getAuth` in unit tests rather than calling Clerk