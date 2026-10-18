import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser } from '../auth/auth.middleware.js';
import {
  createExpenseTypeSchema,
  idParamSchema,
  listQuerySchema,
  updateExpenseTypeSchema,
} from './expense-types.schema.js';
import { expenseTypesService } from './expense-types.service.js';

export const expenseTypesController = {
  list: async (request: FastifyRequest) => {
    const query = listQuerySchema.parse(request.query);
    return expenseTypesService.list(requireUser(request), query);
  },

  get: async (request: FastifyRequest) => {
    const { id } = idParamSchema.parse(request.params);
    return expenseTypesService.get(requireUser(request), id);
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createExpenseTypeSchema.parse(request.body);
    const expenseType = await expenseTypesService.create(requireUser(request), input);
    return reply.status(201).send(expenseType);
  },

  update: async (request: FastifyRequest) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updateExpenseTypeSchema.parse(request.body);
    return expenseTypesService.update(requireUser(request), id, input);
  },

  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = idParamSchema.parse(request.params);
    await expenseTypesService.remove(requireUser(request), id);
    return reply.status(204).send();
  },
};
