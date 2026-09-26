import { z } from 'zod';
import { OrderStatus } from '../constants/orderstatus';

export const createOrderSchema = z.object({
  body: z.object({
    /** A saved address. Defaults to the user's default address when omitted. */
    shippingAddressId: z.string().length(24).optional(),
    /** Escape hatch for a one-off address the user does not want saved. */
    shippingAddress: z.string().max(300).optional(),
    /** Whose measurements to tailor to. Defaults to the user's default profile. */
    measurementProfileId: z.string().length(24).optional(),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    status: z.nativeEnum(OrderStatus),
    remarks: z.string().max(300).optional(),
  }),
});

export const cancelOrderSchema = z.object({
  params: z.object({ id: z.string().length(24) }),
  body: z.object({
    reason: z.string().max(300).optional(),
  }),
});
/** Shopify orders are addressed by their numeric id (the tail of the GID). */
const shopifyOrderParams = z.object({ orderId: z.string().regex(/^\d+$/, 'Invalid order id') });

export const cancelShopifyOrderSchema = z.object({
  params: shopifyOrderParams,
  body: z.object({ reason: z.string().max(300).optional() }),
});

export const shopifyReturnSchema = z.object({
  params: shopifyOrderParams,
  body: z.object({
    resolution: z.enum(['replacement', 'refund']),
    reason: z.enum([
      'SIZE_TOO_SMALL',
      'SIZE_TOO_LARGE',
      'NOT_AS_DESCRIBED',
      'WRONG_ITEM',
      'DEFECTIVE',
      'STYLE',
      'COLOR',
      'UNWANTED',
      'OTHER',
    ]),
    note: z.string().trim().max(250).optional(),
    exchangeFor: z.string().trim().max(80).optional(),
    items: z
      .array(
        z.object({
          lineItemId: z.string().startsWith('gid://shopify/LineItem/'),
          quantity: z.number().int().min(1),
        }),
      )
      .min(1, 'Choose at least one item'),
  }),
});

export const shopifyOrderParamSchema = z.object({ params: shopifyOrderParams });
