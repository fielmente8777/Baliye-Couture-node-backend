import { z } from 'zod';
import { OrderStatus } from '../constants/orderstatus';

export const createOrderSchema = z.object({
  body: z.object({
    shippingAddress: z.string().max(300).optional(),
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