// Load .env before any other import: some libraries (notably @clerk/fastify)
// snapshot process.env at module-load time, which runs before later imports.
import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/client.js';

const app = await buildApp();

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  try {
    await app.close();
    await pool.end();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
