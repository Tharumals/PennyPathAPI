import type { FastifyRequest } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

/** The authenticated caller. Clerk stays at the edge: modules only ever see this shape. */
export interface AuthUser {
  /** Clerk user id (the session token's `sub` claim). */
  id: string;
  /** Only present when the session token carries an email claim. */
  email?: string;
}

/**
 * preHandler hook: requires a valid Clerk session token and sets request.user.
 * clerkPlugin (registered in app.ts) verifies the token; getAuth() reads the result.
 */
export async function authenticate(request: FastifyRequest) {
  const { userId } = getAuth(request);
  if (!userId) throw new UnauthorizedError('Missing or invalid session token');
  request.user = { id: userId };
}

/** Use inside handlers after `authenticate` ran, to get a non-null user. */
export function requireUser(request: FastifyRequest) {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}
