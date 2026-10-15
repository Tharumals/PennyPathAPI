import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

try {
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Migrations applied');
} catch (err) {
  console.error('Migration failed', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
