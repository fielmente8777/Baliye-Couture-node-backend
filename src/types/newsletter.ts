import { z } from 'zod';

export const subscribeSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
    source: z.string().trim().max(40).optional(),
  }),
});

export const subscriberIdParamSchema = z.object({
  params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id') }),
});
