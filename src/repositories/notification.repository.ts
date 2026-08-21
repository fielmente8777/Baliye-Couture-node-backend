import { NotificationStatus } from '@constants/notification';
import { INotification, NotificationModel } from '@models/notification';

class NotificationRepository {
  create(data: Partial<INotification>) {
    return NotificationModel.create(data);
  }

  markSent(id: string) {
    return NotificationModel.findByIdAndUpdate(
      id,
      { status: NotificationStatus.SENT, sentAt: new Date() },
      { new: true }
    ).exec();
  }

  markFailed(id: string, reason: string) {
    return NotificationModel.findByIdAndUpdate(
      id,
      { status: NotificationStatus.FAILED, failReason: reason },
      { new: true }
    ).exec();
  }

  findByUser(userId: string, skip = 0, limit = 10) {
    return NotificationModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
  }
}

export const notificationRepository = new NotificationRepository();
