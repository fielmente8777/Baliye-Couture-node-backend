import { z } from 'zod';

const objectId = z.string().length(24);

export const addWishlistSchema = z.object({
  body: z
    .object({
      kind: z.enum(['product', 'design', 'shopify']),
      productId: objectId.optional(),
      customDesignId: objectId.optional(),
      shopifyProductId: z.string().max(120).optional(),
      snapshot: z
        .object({
          title: z.string().max(200),
          image: z.string().url().optional(),
          price: z.number().nonnegative().optional(),
          currency: z.string().length(3).optional(),
          handle: z.string().max(200).optional(),
        })
        .optional(),
    })
    .refine(
      (b) =>
        (b.kind === 'product' && b.productId) ||
        (b.kind === 'design' && b.customDesignId) ||
        (b.kind === 'shopify' && b.shopifyProductId),
      { message: 'Send the id that matches kind' },
    ),
});

export const wishlistItemParamSchema = z.object({
  params: z.object({ itemId: objectId }),
});

export const removeByRefSchema = z.object({
  body: z.object({
    kind: z.enum(['product', 'design', 'shopify']),
    ref: z.string().min(1).max(120),
  }),
});

export const moveToCartSchema = z.object({
  params: z.object({ itemId: objectId }),
  body: z.object({ measurementProfileId: objectId.optional() }),
});
