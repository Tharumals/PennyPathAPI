import { z } from 'zod';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// Money travels as a decimal string and is stored as numeric(12,2) - never a float.
const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Expected a decimal amount with up to 2 decimals')
  .refine((v) => Number(v) > 0, { message: 'Amount must be greater than 0' });

const currencySchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'Expected an ISO 4217 code');

export const createExpenseSchema = z.object({
  expenseTypeId: z.string().uuid(),
  amount: amountSchema,
  currency: currencySchema.optional(), // defaults to the user's currency
  expenseDate: dateSchema.optional(), // defaults to CURRENT_DATE in the DB
  note: z.string().trim().max(500).optional(),
});

export const updateExpenseSchema = createExpenseSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const idParamSchema = z.object({ id: z.string().uuid() });

export const listQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    expenseTypeId: z.string().uuid().optional(),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    { message: 'from must be on or before to', path: ['from'] },
  );

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listQuerySchema>;
