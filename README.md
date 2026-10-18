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
| GET / POST | /api/v1/tasks | Bearer token |
| GET / PATCH / DELETE | /api/v1/tasks/:id | Bearer token |

Send a Clerk session token: `Authorization: Bearer <session_token>`.

## Adding a module
Copy `src/modules/tasks/` (routes -> controller -> service -> repository + zod schema),
add tables in `src/db/schema/`, and register the routes in `src/app.ts`.
Modules should call each other's *services*, never another module's repository.
