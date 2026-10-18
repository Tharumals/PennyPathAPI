import { z } from 'zod';

export const createExpenseTypeSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(40).optional(),
});

export const updateExpenseTypeSchema = createExpenseTypeSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const idParamSchema = z.object({ id: z.string().uuid() });

export const listQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
});

export type CreateExpenseTypeInput = z.infer<typeof createExpenseTypeSchema>;
export type UpdateExpenseTypeInput = z.infer<typeof updateExpenseTypeSchema>;
export type ListExpenseTypesQuery = z.infer<typeof listQuerySchema>;
