import type { FastifyRequest } from 'fastify';
import { requireUser } from '../auth/auth.middleware.js';
import { updateMeSchema } from './users.schema.js';
import { usersService } from './users.service.js';

export const usersController = {
  me: async (request: FastifyRequest) => usersService.me(requireUser(request)),

  updateMe: async (request: FastifyRequest) => {
    const input = updateMeSchema.parse(request.body);
    return usersService.updateMe(requireUser(request), input);
  },
};
