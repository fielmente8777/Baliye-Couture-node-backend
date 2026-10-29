import { z } from 'zod';

const objectId = z.string().length(24);

export const grantTokensSchema = z.object({
  body: z.object({
    userId: objectId,
    /** Negative to correct a balance down. */
    amount: z.number().int().min(-10000).max(10000).refine((n) => n !== 0, 'Amount cannot be 0'),
    note: z.string().trim().max(200).optional(),
    reason: z.enum(['grant', 'purchase']).optional(),
  }),
});

export const recordAiCreditSchema = z.object({
  body: z.object({
    /** "balance": what OpenAI shows now. "topup": money just added there. */
    kind: z.enum(['balance', 'topup']),
    amountUsd: z.number().min(0).max(100000),
    note: z.string().trim().max(200).optional(),
  }),
});

export const tokenUserParamSchema = z.object({
  params: z.object({ userId: objectId }),
});
