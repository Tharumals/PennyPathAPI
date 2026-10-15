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

  request.log.error(error);
  return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
