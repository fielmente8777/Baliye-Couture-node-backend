import { env } from '@config/env';
import { logger } from '@config/logger';
import { NotificationChannelHandler, NotificationPayload } from './channel';

/**
 * Email channel stub. Wire up nodemailer (or an ESP SDK) here once SMTP
 * credentials are provisioned — the interface is already channel-agnostic
 * so the rest of the notification system doesn't need to change.
 */
export async function send(payload: NotificationPayload): Promise<void> {
  if (!env.smtp.host) {
    logger.warn('SMTP not configured — skipping email send (dev mode)');
    return;
  }

  // TODO: integrate nodemailer transport using env.smtp.*
  logger.info({ to: payload.to, title: payload.title }, 'Email would be sent here');
}

export const emailChannel: NotificationChannelHandler = { send };
