export interface NotificationPayload {
  to: string; // phone, email, or device token depending on channel
  title: string;
  message: string;
}

export interface NotificationChannelHandler {
  send(payload: NotificationPayload): Promise<void>;
}