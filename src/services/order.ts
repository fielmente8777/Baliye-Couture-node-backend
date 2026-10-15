import * as orderRepository from '@repositories/order.repository';
import * as orderTrackingRepository from '@repositories/orderTracking.repository';
import { CustomDesignModel } from '@models/customdesign';
import { ICartItem } from '@models/cart';

/**
 * Freezes a display name, image and price onto the order line, so history is
 * readable even after the underlying product or design changes.
 */
/**
 * A line needs body measurements when it is a custom design that was not
 * ordered in a standard size. Products are cut to a size chart, and a design
 * that recorded a sizeOptionId chose a standard size at build time.
 */
export async function requiresMeasurements(item: ICartItem) {
  if (item.kind === 'product') return false;
  if (!item.customDesignId) return false;

  const design = await CustomDesignModel.findById(item.customDesignId).exec();
  if (!design) return false;

  /* A saved profile on the design means made-to-measure; a size option means
     off-the-rack. Neither means the garment type had no size step at all, in
     which case measurements are the only way to cut it. */
  if (design.sizeOptionId) return false;
  return true;
}

import * as userRepository from '@repositories/user.repository';
import { ApiError } from '@utils/apiError';
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  OrderStatus,
  ORDER_STATUS_FLOW,
  REPLACEMENT_WINDOW_DAYS,
  TERMINAL_ORDER_STATUSES,
} from '@constants/orderstatus';
import { OrderTrackingModel } from '@models/tracking';
import { IOrder } from '@models/order';
import {
  emitOrderCancelled,
  emitOrderStatusUpdated,
} from '@interfaces/events';

export function getUserOrders(userId: string, skip: number, limit: number) {
  return Promise.all([
    orderRepository.findAllByUser(userId, skip, limit),
    orderRepository.countByUser(userId),
  ]);
}

/** When the order was delivered, from its tracking history. */
async function deliveredAt(order: IOrder): Promise<Date | null> {
  if (order.status !== OrderStatus.DELIVERED) return null;
  const entry = await OrderTrackingModel.findOne({
    orderId: order._id,
    status: OrderStatus.DELIVERED,
  })
    .sort({ createdAt: -1 })
    .exec();
  return entry?.createdAt ?? order.updatedAt;
}

/** Last moment a replacement can be requested, or null if not delivered. */
export async function replacementDeadline(order: IOrder): Promise<Date | null> {
  const delivered = await deliveredAt(order);
  if (!delivered) return null;
  return new Date(delivered.getTime() + REPLACEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Order detail plus what the customer may do with it, so the frontend shows
 * the Cancel / Request replacement buttons only when they will work.
 */
export async function getUserOrderById(id: string, userId: string) {
  const order = await orderRepository.findByIdForUser(id, userId);
  if (!order) throw ApiError.notFound('Order not found');

  const deadline = await replacementDeadline(order);

  return {
    ...order.toObject(),
    canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.status),
    canRequestReplacement: Boolean(deadline && deadline.getTime() > Date.now()),
    replacementWindowEndsAt: deadline,
  };
}

export async function cancelUserOrder(id: string, userId: string, reason?: string) {
  const order = await orderRepository.findByIdForUser(id, userId);
  if (!order) throw ApiError.notFound('Order not found');

  if (order.status === OrderStatus.CANCELLED) {
    throw ApiError.badRequest('This order is already cancelled');
  }

  /* Previously any non-terminal status was allowed — including Cutting and
     Shipped, where the fabric is already cut or the parcel is on its way. */
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    throw ApiError.badRequest(
      order.status === OrderStatus.DELIVERED
        ? 'This order has been delivered — request a replacement or alteration instead'
        : `Your order is already in "${order.status}" and can no longer be cancelled online. Please contact us.`,
    );
  }

  const updated = await orderRepository.cancel(id, reason);
  await orderTrackingRepository.create({
    orderId: order._id,
    status: OrderStatus.CANCELLED,
    updatedBy: userId as unknown as never,
    remarks: reason || 'Cancelled by customer',
  });

  const user = await userRepository.findById(userId);
  emitOrderCancelled({
    userId,
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    reason,
    userPhone: user?.phone,
    userEmail: user?.email,
  });

  return updated;
}

export async function deleteUserOrderHistory(id: string, userId: string) {
  const order = await orderRepository.findByIdForUser(id, userId);
  if (!order) throw ApiError.notFound('Order not found');
  return orderRepository.softDelete(id);
}

export async function getTracking(orderId: string, userId?: string) {
  const order = userId
    ? await orderRepository.findByIdForUser(orderId, userId)
    : await orderRepository.findByIdRaw(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  return orderTrackingRepository.findByOrderId(orderId);
}

// ---- Admin ----
export function getAllOrdersAdmin(filter: { status?: OrderStatus }, skip: number, limit: number) {
  return Promise.all([
    orderRepository.findAllAdmin(filter, skip, limit),
    orderRepository.countAdmin(filter),
  ]);
}

export async function getOrderByIdAdmin(id: string) {
  const order = await orderRepository.findByIdRaw(id);
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

export async function updateStatusAdmin(id: string, adminId: string, status: OrderStatus, remarks?: string) {
  const order = await orderRepository.findByIdRaw(id);
  if (!order) throw ApiError.notFound('Order not found');

  const allowedNext = ORDER_STATUS_FLOW[order.status];
  if (!allowedNext.includes(status)) {
    throw ApiError.badRequest(
      `Cannot move order from "${order.status}" to "${status}". Allowed next: ${
        allowedNext.join(', ') || 'none (terminal status)'
      }`
    );
  }

  const updated = await orderRepository.updateStatus(id, status);
  await orderTrackingRepository.create({
    orderId: order._id,
    status,
    updatedBy: adminId as unknown as never,
    remarks,
  });

  const user = await userRepository.findById(order.userId.toString());
  emitOrderStatusUpdated({
    userId: order.userId.toString(),
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    status,
    remarks,
    userPhone: user?.phone,
    userEmail: user?.email,
  });

  return updated;
}

export async function cancelOrderAdmin(id: string, adminId: string, reason?: string) {
  const order = await orderRepository.findByIdRaw(id);
  if (!order) throw ApiError.notFound('Order not found');

  if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
    throw ApiError.badRequest(`Order cannot be cancelled from status "${order.status}"`);
  }

  const updated = await orderRepository.cancel(id, reason);
  await orderTrackingRepository.create({
    orderId: order._id,
    status: OrderStatus.CANCELLED,
    updatedBy: adminId as unknown as never,
    remarks: reason || 'Cancelled by admin',
  });

  const user = await userRepository.findById(order.userId.toString());
  emitOrderCancelled({
    userId: order.userId.toString(),
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    reason,
    userPhone: user?.phone,
    userEmail: user?.email,
  });

  return updated;
}

export async function deleteOrderAdmin(id: string) {
  const order = await orderRepository.softDelete(id);
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}
