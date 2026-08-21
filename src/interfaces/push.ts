import { logger } from '@config/logger';
import { NotificationChannelHandler, NotificationPayload } from './channel';

/**
 * Push channel stub. Wire up Firebase Cloud Messaging (or another provider)
 * here once device tokens are collected from the mobile client.
 */
export async function send(payload: NotificationPayload): Promise<void> {
  logger.info({ to: payload.to, title: payload.title }, 'Push notification would be sent here');
}

export const pushChannel: NotificationChannelHandler = { send };
