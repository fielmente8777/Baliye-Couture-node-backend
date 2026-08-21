import { logger } from "../config/logger";
import { NotificationChannel, NotificationEvent } from "../constants/notification";
import { notificationEvents, OrderCancelledEvent, OrderPlacedEvent, OrderStatusUpdatedEvent } from "../interfaces/events";
import * as notificationService from "./notifications";

/** Registers all domain-event -> notification mappings. Call once at app startup. */
export function registerNotificationListeners(): void {
  notificationEvents.on(NotificationEvent.ORDER_STATUS_UPDATED, (payload: OrderStatusUpdatedEvent) => {
    notificationService
      .dispatch({
        userId: payload.userId,
        event: NotificationEvent.ORDER_STATUS_UPDATED,
        title: `Order ${payload.orderNumber} update`,
        message: `Your order status is now "${payload.status}".${
          payload.remarks ? ` Note: ${payload.remarks}` : ''
        }`,
        channels: [
          { channel: NotificationChannel.SMS, to: payload.userPhone },
          { channel: NotificationChannel.EMAIL, to: payload.userEmail },
          { channel: NotificationChannel.PUSH, to: payload.userId },
        ],
        meta: { orderId: payload.orderId, status: payload.status },
      })
      .catch((err) => logger.error({ err }, 'Failed to dispatch ORDER_STATUS_UPDATED notification'));
  });

  notificationEvents.on(NotificationEvent.ORDER_PLACED, (payload: OrderPlacedEvent) => {
    notificationService
      .dispatch({
        userId: payload.userId,
        event: NotificationEvent.ORDER_PLACED,
        title: 'Order confirmed',
        message: `Your order ${payload.orderNumber} for ${payload.totalAmount} has been placed successfully.`,
        channels: [
          { channel: NotificationChannel.SMS, to: payload.userPhone },
          { channel: NotificationChannel.EMAIL, to: payload.userEmail },
        ],
        meta: { orderId: payload.orderId },
      })
      .catch((err) => logger.error({ err }, 'Failed to dispatch ORDER_PLACED notification'));
  });

  notificationEvents.on(NotificationEvent.ORDER_CANCELLED, (payload: OrderCancelledEvent) => {
    notificationService
      .dispatch({
        userId: payload.userId,
        event: NotificationEvent.ORDER_CANCELLED,
        title: 'Order cancelled',
        message: `Your order ${payload.orderNumber} has been cancelled.${
          payload.reason ? ` Reason: ${payload.reason}` : ''
        }`,
        channels: [
          { channel: NotificationChannel.SMS, to: payload.userPhone },
          { channel: NotificationChannel.EMAIL, to: payload.userEmail },
        ],
        meta: { orderId: payload.orderId },
      })
      .catch((err) => logger.error({ err }, 'Failed to dispatch ORDER_CANCELLED notification'));
  });

  logger.info('Notification event listeners registered');
}