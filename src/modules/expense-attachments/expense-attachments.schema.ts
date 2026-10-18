import { z } from 'zod';

export const createAttachmentSchema = z.object({
  storageKey: z.string().trim().min(1).max(512), // path/key in your bucket
  url: z.string().trim().url().max(2048).optional(),
  mimeType: z.string().trim().max(128).optional(),
  sizeBytes: z.number().int().positive().max(25_000_000).optional(),
  metadata: z.record(z.unknown()).optional(), // e.g. future OCR results
});

export const expenseIdParamSchema = z.object({
  expenseId: z.string().uuid(),
});

export const attachmentIdParamSchema = expenseIdParamSchema.extend({
  id: z.string().uuid(),
});

export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
