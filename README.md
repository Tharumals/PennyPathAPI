# Node API Starter

Fastify + TypeScript + Drizzle ORM + Neon (Postgres) + Clerk (session token verification) + Docker.

## Setup
```bash
cp .env.example .env        # fill in DATABASE_URL and the Clerk keys
npm install
npm run db:migrate          # applies SQL in ./drizzle to Neon
npm run dev                 # http://localhost:3000
```

## Docker
```bash
# development with hot reload
docker compose -f docker-compose.dev.yml up --build

# production-like image
docker compose up --build -d

# run migrations inside the production image
docker compose run --rm api node dist/db/migrate.js
```

## Changing the schema
Edit files in `src/db/schema/`, then:
```bash
npm run db:generate         # creates a new SQL migration in ./drizzle
npm run db:migrate
```

## Endpoints
| Method | Path | Auth |
|---|---|---|
| GET | /health, /health/ready | no |
| GET / PATCH | /api/v1/users/me | Bearer token |
| GET / POST | /api/v1/categories | Bearer token |
| GET / PATCH / DELETE | /api/v1/categories/:id | Bearer token |
| GET / POST | /api/v1/expense-types | Bearer token |
| GET / PATCH / DELETE | /api/v1/expense-types/:id | Bearer token |
| GET / POST | /api/v1/expenses | Bearer token |
| GET / PATCH / DELETE | /api/v1/expenses/:id | Bearer token |
| GET / POST | /api/v1/expenses/:expenseId/attachments | Bearer token |
| DELETE | /api/v1/expenses/:expenseId/attachments/:id | Bearer token |

Send a Clerk session token: `Authorization: Bearer <session_token>`.

Categories and expense types marked as system (`user_id IS NULL`) are readable by
everyone but can only be modified by an admin flow, not through these endpoints.
Deleting an expense is a soft delete (`deleted_at` is set; the row is kept for audit).

## Adding a module
Copy `src/modules/categories/` (routes -> controller -> service -> repository + zod schema),
add tables in `src/db/schema/`, and register the routes in `src/app.ts`.
Modules should call each other's *services* via the module's `index.ts`, never another
module's repository.
