import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Direct endpoint for DDL when available; falls back to DATABASE_URL (single-string setups).
// Using || (not ??) so a blank DATABASE_URL_DIRECT= in .env still falls back.
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL or DATABASE_URL_DIRECT must be set in your .env file');
}

export default defineConfig({
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});