import { EventEmitter } from 'events';
import { NotificationEvent } from '@constants/notification';

export interface OrderStatusUpdatedEvent {
  userId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  remarks?: string;
  userPhone?: string;
  userEmail?: string;
}


export interface OrderCancelledEvent {
  userId: string;
  orderId: string;
  orderNumber: string;
  reason?: string;
  userPhone?: string;
  userEmail?: string;
}

/**
 * Central event bus. Services emit domain events (e.g. an admin updating an
 * order's status) without knowing which notification channels exist.
 * Listeners are registered once in notification.listeners.ts.
 */
export const notificationEvents = new EventEmitter();

export function emitOrderStatusUpdated(payload: OrderStatusUpdatedEvent) {
  notificationEvents.emit(NotificationEvent.ORDER_STATUS_UPDATED, payload);
}

export function emitOrderCancelled(payload: OrderCancelledEvent) {
  notificationEvents.emit(NotificationEvent.ORDER_CANCELLED, payload);
}