import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser } from '../auth/auth.middleware.js';
import { createTaskSchema, idParamSchema, updateTaskSchema } from './tasks.schema.js';
import { tasksService } from './tasks.service.js';

export const tasksController = {
  list: async (request: FastifyRequest) => tasksService.list(requireUser(request)),

  get: async (request: FastifyRequest) => {
    const { id } = idParamSchema.parse(request.params);
    return tasksService.get(requireUser(request), id);
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createTaskSchema.parse(request.body);
    const task = await tasksService.create(requireUser(request), input);
    return reply.status(201).send(task);
  },

  update: async (request: FastifyRequest) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updateTaskSchema.parse(request.body);
    return tasksService.update(requireUser(request), id, input);
  },

  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = idParamSchema.parse(request.params);
    await tasksService.remove(requireUser(request), id);
    return reply.status(204).send();
  },
};
