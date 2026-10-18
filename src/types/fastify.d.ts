import type { AuthUser } from '../modules/auth/auth.middleware.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
