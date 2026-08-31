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