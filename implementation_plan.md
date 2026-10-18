# Implementation Plan

## Overview

Document the PennyPathAPI folder structure and the purpose of every file by **rewriting `README.md`** (documentation only — no code changes). The README will describe the **actual current structure** (Fastify modular monolith: routes → controller → service → repository + shared Drizzle schema), and add a short section mapping it to the **target architecture** defined in `docs/architecture.md` (contracts/api/application/domain/infra), so readers understand both what exists today and where the project is heading.

Context: the project is a Fastify + TypeScript + Drizzle ORM + Neon Postgres + Clerk REST API. The existing README is minimal (setup, Docker, endpoints, "adding a module"). The new README keeps that operational content but leads with a complete, annotated tree and per-file purpose breakdown.

## Types

No type-system changes (documentation-only task). Key types the documentation will mention:

- `AuthUser` (`src/modules/auth/auth.middleware.ts`) — `{ id: string; email?: string }`, the only auth shape modules see
- `Profile`, `Task` (`src/db/schema/*.ts`) — Drizzle-inferred row types
- `CreateTaskInput`, `UpdateTaskInput`, `UpdateProfileInput` — Zod-inferred DTO types
- `Db`, `Tx`, `DbOrTx` (`src/db/client.ts`) — Drizzle client and transaction types
- `AppError` + `UnauthorizedError`, `ForbiddenError`, `NotFoundError` — typed HTTP errors

## Files

### Modified
- `d:\Academic\Projects\FullStack\PennyPathDigital APP\API\PennyPathAPI\README.md` — rewrite with these sections:
  1. Title + one-paragraph project description
  2. **Tech Stack** table (from `package.json`)
  3. **Folder Structure** — annotated tree of the repo (excluding `node_modules`, `dist`, `.git`)
  4. **File-by-file purpose** — grouped tables per folder
  5. **Request Lifecycle** — `server.ts` → `buildApp()` → route → `authenticate` hook → controller (Zod) → service (business rules; cross-module via services only) → repository (scoped Drizzle queries) → central error handler
  6. **Current vs Target Architecture** — current flat module layout vs `docs/architecture.md`'s target (`contracts/`, `api/`, `application/`, `domain/`, `infra/`; module factory + composition root; Postgres schemas per module; outbox/events)
  7. Setup / Docker / Changing the Schema / Endpoints / Adding a Module — existing README content, corrected to **Fastify** (not Express)
  8. Docs index — links to `docs/architecture.md`, `docs/api-conventions.md`, `docs/database.md`, `docs/authentication.md`, `AGENTS.md`

No files created or deleted; no config changes.

## Functions

No function changes. The README will *describe* these existing functions:

| Function | File | Purpose to document |
|---|---|---|
| `buildApp()` | `src/app.ts` | Composition root: Fastify instance, helmet/CORS/rate-limit/Clerk plugins, error handler, router prefixes |
| `shutdown(signal)` | `src/server.ts` | Graceful shutdown on SIGINT/SIGTERM: closes server then DB pool |
| `authenticate(request)` | `src/modules/auth/auth.middleware.ts` | preHandler: requires valid Clerk session token, sets `request.user` |
| `requireUser(request)` | `src/modules/auth/auth.middleware.ts` | Returns non-null `AuthUser` inside handlers |
| `errorHandler(...)` | `src/shared/errors/error-handler.ts` | ZodError → 400, AppError → its status, other 4xx passthrough, else 500 |
| `healthRoutes(app)` | `src/modules/health/health.routes.ts` | `/health` and `/health/ready` (DB ping) |
| `tasksRoutes` / `usersRoutes` | `modules/tasks/tasks.routes.ts`, `modules/users/users.routes.ts` | Register authenticated routes under `/api/v1/*` |
| `tasksController` / `usersController` | `*.controller.ts` | HTTP-only: Zod-parse params/body, call service, set status codes |
| `tasksService` / `usersService` | `*.service.ts` | NotFound handling, `getOrCreateProfile` before task creation; cross-module via services only |
| `tasksRepository` / `usersRepository` | `*.repository.ts` | Only layer touching Drizzle; every query scoped by `userId` |
| `closeDb()` | `src/db/client.ts` | Pool teardown helper |

## Classes

No class changes. Documentation will list the error hierarchy in `src/shared/errors/app-error.ts`:

- `AppError extends Error` — base with `statusCode`, `code`, `message`
- `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404)

## Dependencies

None added/changed. Tech-stack table lists current deps as-is: `fastify`, `@fastify/cors|helmet|rate-limit`, `@clerk/fastify`, `drizzle-orm`, `@neondatabase/serverless`, `pg`, `ws`, `zod`, `dotenv`; dev: `tsx`, `drizzle-kit`, `typescript`, `pino-pretty`.

## Testing

Documentation-only: validation is **manual review** —
1. Re-read `README.md` for accuracy against the actual files
2. Verify every tree entry maps to a real file; no invented files
3. Verify endpoint table matches routes in `app.ts` (`/health`, `/health/ready`, `/api/v1/users/me` GET/PATCH, `/api/v1/tasks` CRUD)
4. Render check in VS Code markdown preview

The Express/Fastify mismatch in `AGENTS.md` will be noted to the user; `AGENTS.md` is **not** modified unless requested.

## Implementation Order

1. Draft the annotated folder tree from the real file listing (exclude `node_modules`, `dist`, `.git`)
2. Write per-folder purpose tables: root config → `src/` entry points → `config/` → `db/` → `modules/` (auth, health, tasks, users) → `shared/` → `types/` → `drizzle/` → `docs/`
3. Add the Request Lifecycle section
4. Add the Current vs Target Architecture section (reference `docs/architecture.md`, do not duplicate)
5. Port existing operational content (Setup, Docker, schema workflow, endpoints, adding a module) with Fastify wording
6. Final pass: cross-check tree against disk, check links, render preview
