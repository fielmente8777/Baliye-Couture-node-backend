import { NotificationModel } from "@models/notification";
import { ApiError } from "@utils/apiError";

/**
 * The in-app notification feed.
 *
 * Separate from services/notifications.ts, which dispatches to SMS, email and
 * push. This only reads what was recorded, for the bell in the navbar.
 */

export function listForUser(userId: string, skip = 0, limit = 20) {
  return NotificationModel.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec();
}

export function countUnread(userId: string) {
  return NotificationModel.countDocuments({ userId, isRead: false }).exec();
}

export async function markRead(id: string, userId: string) {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: id, userId },
    { isRead: true },
    { new: true },
  ).exec();

  if (!notification) throw ApiError.notFound("Notification not found");
  return notification;
}

export async function markAllRead(userId: string) {
  await NotificationModel.updateMany({ userId, isRead: false }, { isRead: true }).exec();
  return { success: true };
}
