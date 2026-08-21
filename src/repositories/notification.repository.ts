import { NotificationStatus } from '@constants/notification';
import { INotification, NotificationModel } from '@models/notification';

export function create(data: Partial<INotification>) {
  return NotificationModel.create(data);
}

export function markSent(id: string) {
  return NotificationModel.findByIdAndUpdate(
    id,
    { status: NotificationStatus.SENT, sentAt: new Date() },
    { new: true }
  ).exec();
}

export function markFailed(id: string, reason: string) {
  return NotificationModel.findByIdAndUpdate(
    id,
    { status: NotificationStatus.FAILED, failReason: reason },
    { new: true }
  ).exec();
}

export function findByUser(userId: string, skip = 0, limit = 10) {
  return NotificationModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
}

