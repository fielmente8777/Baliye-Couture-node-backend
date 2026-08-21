import { randomUUID } from 'crypto';
import { orderRepository } from '@repositories/order.repository';
import { orderTrackingRepository } from '@repositories/orderTracking.repository';
import { cartRepository } from '@repositories/cart.repository';
import { userMeasurementRepository } from '@repositories/userMeasurement.repository';
import { userRepository } from '@repositories/user.repository';
import { ApiError } from '@utils/apiError';
import { OrderStatus, ORDER_STATUS_FLOW, TERMINAL_ORDER_STATUSES } from '@constants/orderstatus';
import {
  emitOrderCancelled,
  emitOrderPlaced,
  emitOrderStatusUpdated,
} from '@interfaces/events';

function generateOrderNumber(): string {
  return `ORD-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

class OrderService {
  async placeOrder(userId: string, shippingAddress?: string) {
    const cart = await cartRepository.findByUser(userId);
    if (!cart || cart.items.length === 0) throw ApiError.badRequest('Cart is empty');

    const measurement = await userMeasurementRepository.findByUserId(userId);
    if (!measurement || measurement.values.length === 0) {
      throw ApiError.badRequest('Please add your body measurements before placing an order');
    }

    const items = cart.items.map((item) => ({
      suitDesignId: item.suitDesignId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.unitPrice * item.quantity,
    }));

    const totalAmount = items.reduce((sum, i) => sum + i.subtotal, 0);

    const order = await orderRepository.create({
      orderNumber: generateOrderNumber(),
      userId: userId as unknown as never,
      items,
      measurementSnapshotId: measurement._id,
      totalAmount,
      shippingAddress,
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

  getUserOrders(userId: string, skip: number, limit: number) {
    return Promise.all([
      orderRepository.findAllByUser(userId, skip, limit),
      orderRepository.countByUser(userId),
    ]);
  }

  async getUserOrderById(id: string, userId: string) {
    const order = await orderRepository.findByIdForUser(id, userId);
    if (!order) throw ApiError.notFound('Order not found');
    return order;
  }

  async cancelUserOrder(id: string, userId: string, reason?: string) {
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

  async deleteUserOrderHistory(id: string, userId: string) {
    const order = await orderRepository.findByIdForUser(id, userId);
    if (!order) throw ApiError.notFound('Order not found');
    return orderRepository.softDelete(id);
  }

  async getTracking(orderId: string, userId?: string) {
    const order = userId
      ? await orderRepository.findByIdForUser(orderId, userId)
      : await orderRepository.findByIdRaw(orderId);
    if (!order) throw ApiError.notFound('Order not found');
    return orderTrackingRepository.findByOrderId(orderId);
  }

  // ---- Admin ----
  getAllOrdersAdmin(filter: { status?: OrderStatus }, skip: number, limit: number) {
    return Promise.all([
      orderRepository.findAllAdmin(filter, skip, limit),
      orderRepository.countAdmin(filter),
    ]);
  }

  async getOrderByIdAdmin(id: string) {
    const order = await orderRepository.findByIdRaw(id);
    if (!order) throw ApiError.notFound('Order not found');
    return order;
  }

  async updateStatusAdmin(id: string, adminId: string, status: OrderStatus, remarks?: string) {
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

  async cancelOrderAdmin(id: string, adminId: string, reason?: string) {
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

  async deleteOrderAdmin(id: string) {
    const order = await orderRepository.softDelete(id);
    if (!order) throw ApiError.notFound('Order not found');
    return order;
  }
}

export const orderService = new OrderService();