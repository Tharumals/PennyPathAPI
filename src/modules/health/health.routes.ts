import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok' }));

  // PUBLIC (no auth): smoke test to verify the API is up and reachable.
  // Deliberately outside /api/v1 and registered without the `authenticate`
  // preHandler so it responds even without a Clerk session token.
  app.get('/test', async () => ({
    status: 'ok',
    message: 'PennyPath API is working',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/ready', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'database unavailable' });
    }
  });
}
