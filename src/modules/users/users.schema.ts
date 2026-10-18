import { z } from 'zod';

export const updateMeSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    currency: z.string().regex(/^[A-Za-z]{3}$/, 'Expected an ISO 4217 code'),
    timezone: z.string().trim().min(1).max(64),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
