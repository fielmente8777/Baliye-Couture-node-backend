import { z } from 'zod';

export const addToCartSchema = z.object({
  body: z.object({
    suitDesignId: z.string().length(24),
    quantity: z.number().int().positive().default(1),
    /** Optional — omit to use the user's default measurement profile. */
    measurementProfileId: z.string().length(24).optional(),
  }),
});

export const updateCartItemSchema = z.object({
  params: z.object({ id: z.string().length(24) }), // cart item _id
  body: z.object({
    quantity: z.number().int().positive().optional(),
    measurementProfileId: z.string().length(24).optional(),
  }),
});