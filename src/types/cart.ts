import { z } from 'zod';

export const addToCartSchema = z.object({
  body: z
    .object({
      /** 'product' buys as-is; 'design' adds a saved CustomDesign. */
      kind: z.enum(['product', 'design']),
      productId: z.string().length(24).optional(),
      customDesignId: z.string().length(24).optional(),
      quantity: z.number().int().positive().default(1),
      /** Optional — omit to use the user's default measurement profile. */
      measurementProfileId: z.string().length(24).optional(),
    })
    .refine(
      (body) =>
        body.kind === 'product' ? Boolean(body.productId) : Boolean(body.customDesignId),
      { message: 'Provide productId for kind=product, or customDesignId for kind=design' }
    ),
});

export const updateCartItemSchema = z.object({
  params: z.object({ id: z.string().length(24) }), // cart item _id
  body: z.object({
    quantity: z.number().int().positive().optional(),
    measurementProfileId: z.string().length(24).optional(),
  }),
});