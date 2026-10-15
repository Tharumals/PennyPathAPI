import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
import { verifyAccessToken } from './auth.service.js';

/** preHandler hook: requires a valid Supabase access token and sets request.user */
export async function authenticate(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }
  request.user = await verifyAccessToken(header.slice(7));
}

/** Use inside handlers after `authenticate` ran, to get a non-null user. */
export function requireUser(request: FastifyRequest) {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}
