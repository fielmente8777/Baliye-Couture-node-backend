import { Schema, model, Document, Types } from 'mongoose';
import { NotificationChannel, NotificationEvent, NotificationStatus } from '../constants/notification';


export interface INotification extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  event: NotificationEvent;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  message: string;
  meta?: Record<string, unknown>;
  sentAt?: Date;
  failReason?: string;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    event: { type: String, enum: Object.values(NotificationEvent), required: true },
    channel: { type: String, enum: Object.values(NotificationChannel), required: true },
    status: {
      type: String,
      enum: Object.values(NotificationStatus),
      default: NotificationStatus.PENDING,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
    sentAt: { type: Date },
    failReason: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const NotificationModel = model<INotification>('Notification', notificationSchema);