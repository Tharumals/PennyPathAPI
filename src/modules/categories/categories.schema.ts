import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().min(1).max(32).optional(),
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const idParamSchema = z.object({ id: z.string().uuid() });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
