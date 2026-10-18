import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: z.string().default('*'),
  // Neon POOLED endpoint (host contains "-pooler"): what the running app queries through.
  DATABASE_URL: z.string().url(),
  // Neon DIRECT endpoint: migrations and one-off scripts that need session features.
  // Optional so a single-connection-string setup still works; falls back to DATABASE_URL.
  DATABASE_URL_DIRECT: z.string().url().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  // Clerk (auth). Keys come from the Clerk Dashboard -> API Keys page.
  CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  DATABASE_URL_DIRECT: parsed.data.DATABASE_URL_DIRECT ?? parsed.data.DATABASE_URL,
};
