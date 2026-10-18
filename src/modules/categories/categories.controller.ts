import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser } from '../auth/auth.middleware.js';
import {
  createCategorySchema,
  idParamSchema,
  updateCategorySchema,
} from './categories.schema.js';
import { categoriesService } from './categories.service.js';

export const categoriesController = {
  list: async (request: FastifyRequest) => categoriesService.list(requireUser(request)),

  get: async (request: FastifyRequest) => {
    const { id } = idParamSchema.parse(request.params);
    return categoriesService.get(requireUser(request), id);
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createCategorySchema.parse(request.body);
    const category = await categoriesService.create(requireUser(request), input);
    return reply.status(201).send(category);
  },

  update: async (request: FastifyRequest) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updateCategorySchema.parse(request.body);
    return categoriesService.update(requireUser(request), id, input);
  },

  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = idParamSchema.parse(request.params);
    await categoriesService.remove(requireUser(request), id);
    return reply.status(204).send();
  },
};
