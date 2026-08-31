import { randomUUID } from 'crypto';
import * as orderRepository from '@repositories/order.repository';
import * as orderTrackingRepository from '@repositories/orderTracking.repository';
import * as cartRepository from '@repositories/cart.repository';
import * as measurementProfileRepository from '@repositories/measurementProfile.repository';
import * as measurementService from './measurement';
import * as addressService from './address';
import * as userRepository from '@repositories/user.repository';
import { ApiError } from '@utils/apiError';
import { IMeasurementProfile } from '@models/measurementprofile';
import { OrderStatus, ORDER_STATUS_FLOW, TERMINAL_ORDER_STATUSES } from '@constants/orderstatus';
import {
  emitOrderCancelled,
  emitOrderPlaced,
  emitOrderStatusUpdated,
} from '@interfaces/events';

function generateOrderNumber(): string {
  return `ORD-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function placeOrder(
  userId: string,
  shippingAddress?: string,
  measurementProfileId?: string,
  shippingAddressId?: string
) {
  const cart = await cartRepository.findByUser(userId);
  if (!cart || cart.items.length === 0) throw ApiError.badRequest('Cart is empty');

  /**
   * Resolution order for each line: the profile chosen on the cart item, then
   * the one passed with the order, then the user's default. A single-profile
   * customer never chooses anything; a customer ordering for two people can
   * set it per item.
   */
  const orderLevel = measurementProfileId
    ? await measurementService.assertOwnedProfile(measurementProfileId, userId)
    : await measurementService.getDefaultProfile(userId);

  const profileCache = new Map<string, IMeasurementProfile>();
  if (orderLevel) profileCache.set(orderLevel._id.toString(), orderLevel);

  const items = [];

  for (const item of cart.items) {
    const itemProfileId = item.measurementProfileId?.toString();

    let profile = itemProfileId ? profileCache.get(itemProfileId) ?? null : orderLevel;

    if (itemProfileId && !profile) {
      profile = await measurementService.assertOwnedProfile(itemProfileId, userId);
      profileCache.set(itemProfileId, profile);
    }

    if (!profile || profile.values.length === 0) {
      throw ApiError.badRequest('Please add your body measurements before placing an order');
    }

    items.push({
      suitDesignId: item.suitDesignId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.unitPrice * item.quantity,
      measurementProfileId: profile._id,
      /* Frozen: renaming or deleting the profile must not alter this order. */
      measurementSnapshot: {
        profileName: profile.profileName,
        values: profile.values.map((v) => ({ name: v.name, value: v.value, unit: v.unit })),
      },
    });
  }

  const measurement = orderLevel ?? (await measurementService.getDefaultProfile(userId));
  if (!measurement) {
    throw ApiError.badRequest('Please add your body measurements before placing an order');
  }

  const totalAmount = items.reduce((sum, i) => sum + i.subtotal, 0);

  /**
   * Address resolution mirrors measurements: an explicit id, then a raw string
   * for a one-off delivery, then the user's default. Flattened to text on the
   * order so a later edit cannot rewrite where a past order was sent.
   */
  const address = shippingAddressId
    ? await addressService.getAddressById(shippingAddressId, userId)
    : shippingAddress
      ? null
      : await addressService.getDefaultAddress(userId);

  const resolvedAddress = address ? addressService.formatAddress(address) : shippingAddress;

  if (!resolvedAddress) {
    throw ApiError.badRequest('Please add a shipping address before placing an order');
  }

  const order = await orderRepository.create({
    orderNumber: generateOrderNumber(),
    userId: userId as unknown as never,
    items,
    measurementSnapshotId: measurement._id,
    totalAmount,
    shippingAddressId: address?._id,
    shippingAddress: resolvedAddress,
    status: OrderStatus.PENDING,
  });

  await orderTrackingRepository.create({
    orderId: order._id,
    status: OrderStatus.PENDING,
    updatedBy: userId as unknown as never,
    remarks: 'Order placed by customer',
  });

  await cartRepository.clearForUser(userId);

  const user = await userRepository.findById(userId);
  emitOrderPlaced({
    userId,
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    totalAmount,
    userPhone: user?.phone,
    userEmail: user?.email,
  });

  return order;
}

export function getUserOrders(userId: string, skip: number, limit: number) {
  return Promise.all([
    orderRepository.findAllByUser(userId, skip, limit),
    orderRepository.countByUser(userId),
  ]);
}

export async function getUserOrderById(id: string, userId: string) {
  const order = await orderRepository.findByIdForUser(id, userId);
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

export async function cancelUserOrder(id: string, userId: string, reason?: string) {
  const order = await orderRepository.findByIdForUser(id, userId);
  if (!order) throw ApiError.notFound('Order not found');

  if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
    throw ApiError.badRequest(`Order cannot be cancelled from status "${order.status}"`);
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
