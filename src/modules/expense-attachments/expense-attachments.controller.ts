import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser } from '../auth/auth.middleware.js';
import {
  attachmentIdParamSchema,
  createAttachmentSchema,
  expenseIdParamSchema,
} from './expense-attachments.schema.js';
import { expenseAttachmentsService } from './expense-attachments.service.js';

export const expenseAttachmentsController = {
  list: async (request: FastifyRequest) => {
    const { expenseId } = expenseIdParamSchema.parse(request.params);
    return expenseAttachmentsService.list(requireUser(request), expenseId);
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    const { expenseId } = expenseIdParamSchema.parse(request.params);
    const input = createAttachmentSchema.parse(request.body);
    const attachment = await expenseAttachmentsService.create(
      requireUser(request),
      expenseId,
      input,
    );
    return reply.status(201).send(attachment);
  },

  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    const { expenseId, id } = attachmentIdParamSchema.parse(request.params);
    await expenseAttachmentsService.remove(requireUser(request), expenseId, id);
    return reply.status(204).send();
  },
};
