import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser } from '../auth/auth.middleware.js';
import {
  createExpenseSchema,
  idParamSchema,
  listQuerySchema,
  updateExpenseSchema,
} from './expenses.schema.js';
import { expensesService } from './expenses.service.js';

export const expensesController = {
  list: async (request: FastifyRequest) => {
    const query = listQuerySchema.parse(request.query);
    return expensesService.list(requireUser(request), query);
  },

  get: async (request: FastifyRequest) => {
    const { id } = idParamSchema.parse(request.params);
    return expensesService.get(requireUser(request), id);
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createExpenseSchema.parse(request.body);
    const expense = await expensesService.create(requireUser(request), input);
    return reply.status(201).send(expense);
  },

  update: async (request: FastifyRequest) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updateExpenseSchema.parse(request.body);
    return expensesService.update(requireUser(request), id, input);
  },

  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = idParamSchema.parse(request.params);
    await expensesService.remove(requireUser(request), id);
    return reply.status(204).send();
  },
};
