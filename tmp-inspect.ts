import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL set');
  process.exit(1);
}
console.log('Host:', new URL(url).host, '| pooler:', new URL(url).host.includes('-pooler'));

const sql = neon(url);
const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`;
console.log('Tables:', tables.map((r) => r.table_name).join(', '));

const migr = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='drizzle' ORDER BY 1`;
console.log('drizzle schema tables:', migr.map((r) => r.table_name).join(', ') || '(none)');

try {
  const rows = await sql`SELECT tag FROM drizzle.__drizzle_migrations ORDER BY id`;
  console.log('Applied migrations:', rows.map((r) => r.tag).join(', '));
} catch (e) {
  console.log('No migrations table:', (e as Error).message);
}
