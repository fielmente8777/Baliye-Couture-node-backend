import twilio from 'twilio';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { NotificationChannelHandler, NotificationPayload } from './channel';

const client =
  env.twilio.accountSid && env.twilio.authToken
    ? twilio(env.twilio.accountSid, env.twilio.authToken)
    : null;

export class SmsChannel implements NotificationChannelHandler {
  async send(payload: NotificationPayload): Promise<void> {
    if (!client) {
      logger.warn('Twilio not configured — skipping SMS send (dev mode)');
      return;
    }
    await client.messages.create({
      to: payload.to,
      from: env.twilio.fromNumber,
      body: `${payload.title}\n${payload.message}`,
    });
  }
}

export const smsChannel = new SmsChannel();