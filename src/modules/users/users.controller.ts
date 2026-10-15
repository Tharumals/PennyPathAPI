import type { FastifyRequest } from 'fastify';
import { requireUser } from '../auth/auth.middleware.js';
import { updateProfileSchema } from './users.schema.js';
import { usersService } from './users.service.js';

export const usersController = {
  me: async (request: FastifyRequest) => usersService.getOrCreateProfile(requireUser(request)),

  updateMe: async (request: FastifyRequest) => {
    const input = updateProfileSchema.parse(request.body);
    return usersService.updateProfile(requireUser(request), input);
  },
};
