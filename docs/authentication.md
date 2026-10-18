# Authentication and Authorization Guidelines

Authentication uses **Clerk** via `@clerk/express`. Clients send a Clerk session token; the API verifies it and identifies the user by their Clerk `userId`. Authorization (what that user may do) is decided by our own code.

**Read this file before:** implementing auth, protecting routes, accessing user data, adding a role or permission check, or handling webhooks.

Related docs: `docs/architecture-guidelines.md` (modules, `RequestContext`), `docs/api-conventions.md` (error format, webhooks, headers), `docs/database.md`

## Core Principles

1. **Deny by default.** Every route requires authentication unless it is explicitly allow-listed as public.
2. **The server decides identity.** Never accept `userId` (or roles, or tenant IDs) from the request body, query, params, or custom headers as proof of identity.
3. **Authentication is not authorization.** A valid token only proves who the caller is. Every use case still checks what they may do.
4. **Scope every query by owner.** A user must only ever read or change their own data (or their organization's, if you use organizations).
5. **Authorize in the application layer** (services/policies), not only at the route.
6. **Keep Clerk at the edge.** Only `shared/auth` imports `@clerk/express`. Modules see a `RequestContext`, never Clerk types.
7. **Fail closed and fail quietly.** Errors deny access and never reveal whether another user's resource exists or why a token was rejected.

## Setup

### Environment variables

Validated at startup in `config/env.ts` (the app must refuse to boot if they are missing):

```
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=       # only if webhooks are used (confirm the exact name in the Clerk dashboard/docs)
CLERK_AUTHORIZED_PARTIES=https://app.example.com,https://admin.example.com
```

Secrets come from the environment or a secret manager. Never commit them, log them, or return them in responses.

### Middleware order in `app.ts`

Order matters. Request ID and logging come first so that auth failures are traceable. Webhook routes use a raw body and are mounted **before** `express.json()`.

```typescript
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { requireUser, attachContext } from "@/shared/auth";

const app = express();

app.use(requestId());                     // 1. X-Request-Id, logger child
app.use(helmet());                        // 2. Security headers
app.use(cors(corsOptions));               // 3. Restrictive allow-list
app.use(rateLimiter);                     // 4. Global limiter (stricter on auth-sensitive routes)

app.get("/health/live", live);            // 5. Public routes BEFORE the guard
app.get("/health/ready", ready);
app.use("/webhooks", webhooksRouter);     //    Own raw-body parsing and signature check (see Webhooks)

app.use(express.json({ limit: "100kb" }));//  6. JSON parsing for everything else
app.use(
  clerkMiddleware({
    authorizedParties: env.CLERK_AUTHORIZED_PARTIES, // 7. Reject tokens minted for other origins
  }),
);

app.use("/api/v1", requireUser, attachContext); // 8. Everything under /api/v1 requires a user
app.use("/api/v1/payments", payments.router);   // 9. Module routers (see architecture-guidelines.md)

app.use(errorHandler);                    // 10. Last
```

Notes:

- `clerkMiddleware()` only **reads and verifies** the session token and attaches the auth state. It does **not** block unauthenticated requests. Blocking is the job of `requireUser`.
- Set `authorizedParties` so tokens issued for other origins/apps are rejected. Verify option names against the `@clerk/express` version you have installed.
- Optional: to avoid a network fetch for verification keys, Clerk supports verifying with a configured JWT public key (see the Clerk docs). Use it if latency or availability of key fetching becomes a concern.
- Clients authenticate with `Authorization: Bearer <session token>`. Prefer bearer tokens for a cross-origin API. If you ever accept cookie-based sessions, add CSRF protection.

### The auth guard

Do not use Clerk's `requireAuth()` for an API: it **redirects** unauthenticated requests to a sign-in page. APIs must return `401` with the standard error body.

```typescript
// shared/auth/require-user.ts
import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { UnauthorizedError } from "@/shared/errors";

export const requireUser: RequestHandler = (req, res, next) => {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated || !userId) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return next(new UnauthorizedError());
  }
  next();
};
```

The client always receives the same generic `401` (`code: "UNAUTHORIZED"`), whether the token is missing, expired, or malformed. Log the real reason server-side (without the token).

### Building the request context

The guard runs once. A second middleware turns Clerk's auth state into the `RequestContext` that the rest of the app uses (see `architecture-guidelines.md`).

```typescript
// shared/auth/context.ts
import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { UnauthorizedError } from "@/shared/errors";
import type { RequestContext } from "@/shared/context/request-context";

declare module "express-serve-static-core" {
  interface Request { ctx?: RequestContext }
}

export const attachContext: RequestHandler = (req, _res, next) => {
  const { userId, orgId, orgRole } = getAuth(req);
  if (!userId) return next(new UnauthorizedError());
  req.ctx = { userId, orgId: orgId ?? undefined, orgRole: orgRole ?? undefined, requestId: req.id };
  next();
};

/** Use in controllers. Throws if called outside requireUser + attachContext. */
export const getContext = (req: Request): RequestContext => {
  if (!req.ctx) throw new UnauthorizedError();
  return req.ctx;
};
```

Because only `shared/auth` touches Clerk, swapping providers later, or testing without Clerk, only affects this folder.

## Using the Identity

Controllers get the context and pass it down. Services and repositories take it (or `userId`) as an explicit parameter. They never read `req`.

```typescript
// controller
const payment = await service.getById(getContext(req), req.params.id);

// repository: ownership is part of the query itself
findById: (id: string, userId: string) =>
  db.query.payments.findFirst({
    where: and(eq(payments.id, id), eq(payments.userId, userId)),
  }),
```

- Every repository method that reads or writes user-owned data must require the owner (`userId`, or `orgId` for organization data). If a method does not take it, that is a red flag.
- Apply the owner scope to **updates and deletes** too, not only reads (`UPDATE ... WHERE id = $1 AND user_id = $2`).
- **Clerk user IDs are strings like `user_2abc...`, not UUIDs.** Store them in `text` columns (`userId: text("user_id")`). Do not type them as `uuid`. Validate them as non-empty strings with the `user_` prefix at the edge.
- Optional hardening: Postgres row-level security keyed by a per-transaction setting for the current user, as a second line of defense behind the application checks.

### Identity across modules

- Other modules receive `ctx` as a parameter on contract methods (`getPayment(ctx, id)`). They never fetch the user from Clerk themselves.
- Do **not** call `clerkClient.users.getUser()` on every request. It adds latency and counts against Clerk rate limits. Put the claims you need into the session token, or keep a local copy of the fields you need (synced via webhooks).
- A `users` or `profiles` module may own local user data (preferences, display name). It is keyed by the Clerk `userId` and populated by webhooks or lazily on first request.

## Authorization

Authentication says who. Authorization says what they may do. Both are required.

### Ownership

The default rule: a user may access only records whose owner is their `userId`. This is enforced by scoping the query (above).

### Roles, permissions, and organizations

If you use roles or organizations:

- Read them from the **verified** session (`getAuth(req)`), copy the values you need into `RequestContext` once, and never accept them from the client.
- Check them in a central **policy** function in the application layer, not with inline string comparisons scattered across handlers:

```typescript
// modules/payments/application/payments.policy.ts
export const paymentsPolicy = {
  canRefund(ctx: RequestContext, payment: PaymentView) {
    if (payment.userId !== ctx.userId && ctx.orgRole !== "org:admin") throw new NotFoundError();
    if (ctx.orgRole !== "org:admin") throw new ForbiddenError("Refunds require an admin");
  },
};
```

- If the data is tenant-scoped, scope by `orgId` as well as the ownership check. A missing `orgId` means no access, not "all tenants".
- Prefer permission names (`org:payments:refund`) over role names in checks, so roles can change without code changes.
- Revoking a role takes effect when the session token is refreshed. For high-risk actions (large payments, changing payout details, deleting an account), require a fresh authentication or re-verification step where Clerk supports it, and re-check authorization server-side every time.

### Status codes

| Situation | Response |
| --- | --- |
| No, invalid, or expired token | `401 Unauthorized` (+ `WWW-Authenticate: Bearer`) |
| Authenticated, resource is visible to the user, but action not permitted (e.g. role) | `403 Forbidden` |
| Resource belongs to another user or tenant | `404 Not Found` (do not reveal it exists) |
| Too many attempts | `429 Too Many Requests` (+ `Retry-After`) |

All errors use the Problem Details body from `api-conventions.md`.

## Public Routes

Public routes must be registered before `requireUser` and listed here:

- `GET /health/live`
- `GET /health/ready`
- `POST /webhooks/clerk` (own signature verification, not user auth)
- [ADD OTHERS EXPLICITLY]

Rules:

- Adding a public route requires a comment in `app.ts` explaining why, and an update to this list.
- Public routes get their own, stricter rate limits and must never return user data.
- Do not expose health details (versions, dependency errors) publicly. Return minimal status.

## Webhooks (Clerk)

If you sync Clerk events (for example `user.created`, `user.updated`, `user.deleted`) into your database:

- Mount the route **before** `express.json()`, with `express.raw({ type: "application/json" })` on that route only. Signature verification needs the exact raw bytes.
- Verify the signature before reading anything. Clerk's SDK provides `verifyWebhook` for Express:

```typescript
// shared/auth/clerk-webhook.router.ts
import express, { Router } from "express";
import { verifyWebhook } from "@clerk/express/webhooks";

export const webhooksRouter = Router();

webhooksRouter.post(
  "/clerk",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let evt;
    try {
      evt = await verifyWebhook(req); // verifies Svix signature + timestamp; uses the signing secret from env
    } catch {
      return res.status(400).send("Invalid webhook"); // generic; log the reason server-side
    }

    const eventId = req.header("svix-id")!;
    const firstTime = await webhookInbox.recordIfNew("clerk", eventId); // unique index on (provider, event_id)
    if (firstTime) await identityEvents.enqueue(evt);                   // process asynchronously (outbox/queue)

    res.status(200).send("ok"); // acknowledge quickly, even for duplicates
  },
);
```

- **Idempotency:** webhooks are delivered at least once. Deduplicate by the Svix event ID in an inbox table, and make handlers safe to run twice.
- **Ordering:** do not assume events arrive in order. Compare timestamps or versions before overwriting local data.
- **Respond fast:** acknowledge with `200` and process asynchronously so slow handlers do not trigger retries.
- Keep webhook handling out of `requireUser`, and apply the replay window that the verifier enforces (do not disable timestamp checks).
- **`user.deleted`:** payments and ledger records are immutable financial records. Do **not** delete them. Remove or anonymize personal data (name, email, profile), keep the opaque `userId` on financial rows, and follow your retention and privacy policy.

## Machine-to-Machine and Internal Calls

- Clerk session tokens are for end users. Background jobs, internal services, and third-party integrations must use a separate mechanism (scoped API keys or service credentials), never a user's token.
- Calls between modules are in-process and pass `ctx`. They do not need tokens.
- Background jobs that act on behalf of a user carry the `userId` explicitly in the job payload and re-check authorization when they run.

## Logging, Monitoring, and Abuse Protection

- Log auth failures with `requestId`, route, and a reason code. **Never log tokens, `Authorization` headers, cookies, or webhook bodies containing personal data.**
- Add `userId` to the logger context after authentication so every log line is attributable.
- Rate-limit by IP before auth and by `userId` after auth. Use stricter limits on writes and money-moving endpoints.
- Alert on spikes in `401`/`403`, on webhook signature failures, and on repeated `404` probing for IDs from one user.
- Keep an audit trail (who, what, when) for sensitive actions: refunds, cancellations, role changes, account deletion.

## Security Checklist

- [ ] New route is under `/api/v1` (protected) or deliberately public, documented here, and commented in `app.ts`
- [ ] Route uses the guard that returns `401`, not Clerk's redirecting `requireAuth()`
- [ ] Every user-data query (read, update, delete) is scoped by `userId` (and `orgId` where relevant)
- [ ] `userId`, roles, and tenant IDs are never read from `req.body`, `req.query`, `req.params`, or client headers for identity
- [ ] `userId` columns are `text`, not `uuid`
- [ ] Authorization (roles, permissions, ownership) is checked in the application layer through a policy
- [ ] Error responses do not reveal whether another user's resource exists or why a token failed
- [ ] Secrets are read from env, validated at startup, never hard-coded or logged
- [ ] Webhook routes use raw body, signature verification, an inbox for idempotency, and async processing
- [ ] Sensitive actions are audited and, where appropriate, require fresh authentication
- [ ] No tokens, cookies, or personal data in logs

## Testing Auth

- Unit tests do not call Clerk. Build a `RequestContext` directly and call services and policies.
- For API tests, compose the app with a **test auth middleware** that sets `req.ctx` from a test header. This avoids mocking Clerk internals. Keep this swap in the composition root and never enable it in production.
- Required cases for every protected endpoint:
  - no token returns `401`
  - expired or malformed token returns `401`
  - user A cannot read, update, or delete user B's records (expect `404`)
  - a user without the required role or permission gets `403`
- Test webhooks: invalid signature is rejected, a replayed event is processed once, an out-of-order event does not overwrite newer data.
- Add one end-to-end smoke test against a Clerk development instance in CI (or a nightly job) to catch SDK upgrade regressions.

## Maintenance

- Pin `@clerk/express` and review its changelog on upgrades. Re-run the auth test suite and the smoke test.
- Review this file and the public route list whenever a new module or webhook is added.