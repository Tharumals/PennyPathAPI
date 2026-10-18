import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import { env } from '../config/env.js';

neonConfig.webSocketConstructor = ws;

// Migrations run over the DIRECT endpoint: DDL must not go through the transaction-mode
// pooler, which does not guarantee a session persists across statements.
const pool = new Pool({
  connectionString: env.DATABASE_URL_DIRECT,
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  const db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Migrations applied');
} catch (err) {
  console.error('Migration failed', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
