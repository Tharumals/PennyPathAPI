import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './app-error.js';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.flatten() },
    });
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
  }

  // Fastify's own 4xx errors (bad JSON, rate limit, etc.)
  if (error.statusCode && error.statusCode < 500) {
    return reply
      .status(error.statusCode)
      .send({ error: { code: error.code ?? 'BAD_REQUEST', message: error.message } });
  }

  // Postgres constraint violations from Drizzle/Neon surface as plain errors carrying
  // a SQLSTATE code. Map the ones our schemas intentionally create (case-insensitive
  // unique indexes on categories/expense-types, FK restrict, CHECK on amount).
  const sqlState = typeof error.code === 'string' ? error.code : undefined;
  if (sqlState === '23505') {
    return reply
      .status(409)
      .send({ error: { code: 'CONFLICT', message: 'A record with that name already exists' } });
  }
  if (sqlState === '23503') {
    return reply
      .status(409)
      .send({ error: { code: 'CONFLICT', message: 'A referenced record is still in use' } });
  }
  if (sqlState === '23514') {
    return reply
      .status(400)
      .send({ error: { code: 'VALIDATION_ERROR', message: 'Value violates a database constraint' } });
  }

  request.log.error(error);
  return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
