import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { env } from '../config/env.js';

// Node versions without a global WebSocket (Node < 22) need an explicit constructor for
// the driver's ws:// transport. Needed for interactive transactions, unlike neon-http.
neonConfig.webSocketConstructor = ws;

export const pool = new Pool({
  connectionString: env.DATABASE_URL, // pooled endpoint (transaction-mode PgBouncer)
  max: env.DB_POOL_MAX, // total = max x instances; keep below Neon compute/pooler limits
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000, // fail fast; also covers cold starts of a suspended compute
});

// Module scope has no Fastify request/logger, so fall back to console here.
pool.on('error', (err: Error) => console.error('Unexpected database pool error', err));

// No global schema object on purpose: repositories use the core query builder, and a
// schema object would force every module's tables into one import.
export const db = drizzle({ client: pool });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export const closeDb = () => pool.end(); // call during graceful shutdown
