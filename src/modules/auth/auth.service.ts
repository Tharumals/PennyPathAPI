import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors/app-error.js';

export interface AuthUser {
  id: string; // Supabase user id (JWT `sub`)
  email?: string;
  role?: string;
}

const issuer = `${env.SUPABASE_URL}/auth/v1`;
const audience = 'authenticated';

// Newer Supabase projects sign tokens with asymmetric keys (verify via JWKS).
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
// Legacy projects use a shared HS256 secret.
const secret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  try {
    const { payload } = secret
      ? await jwtVerify(token, secret, { issuer, audience })
      : await jwtVerify(token, jwks, { issuer, audience });

    if (!payload.sub) throw new Error('Missing sub claim');

    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role: typeof payload.role === 'string' ? payload.role : undefined,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
