import { NotificationChannel, NotificationEvent } from "../constants/notification";
import { NotificationChannelHandler } from "../interfaces/channel";
import { emailChannel } from "../interfaces/email";
import { pushChannel } from "../interfaces/push";
import { smsChannel } from "../interfaces/sms";
import { logger } from "../config/logger";
import * as notificationRepository from "../repositories/notification.repository";

const CHANNEL_MAP: Record<NotificationChannel, NotificationChannelHandler> = {
  [NotificationChannel.SMS]: smsChannel,
  [NotificationChannel.EMAIL]: emailChannel,
  [NotificationChannel.PUSH]: pushChannel,
};

interface DispatchParams {
  userId: string;
  event: NotificationEvent;
  title: string;
  message: string;
  channels: { channel: NotificationChannel; to?: string }[];
  meta?: Record<string, unknown>;
}

/**
 * Persists a Notification record per channel and attempts delivery.
 * A failure on one channel never blocks the others or the caller —
 * notifications are best-effort and must not break the business flow
 * (e.g. an admin updating order status should succeed even if SMS fails).
 */
export async function dispatch(params: DispatchParams): Promise<void> {
  for (const { channel, to } of params.channels) {
    const notification = await notificationRepository.create({
      userId: params.userId as unknown as never,
      event: params.event,
      channel,
      title: params.title,
      message: params.message,
      meta: params.meta,
    });

    if (!to) {
      await notificationRepository.markFailed(notification._id.toString(), 'Missing recipient address');
      continue;
    }

    try {
      await CHANNEL_MAP[channel].send({ to, title: params.title, message: params.message });
      await notificationRepository.markSent(notification._id.toString());
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, channel, userId: params.userId }, 'Notification delivery failed');
      await notificationRepository.markFailed(notification._id.toString(), reason);
    }
  }
}
