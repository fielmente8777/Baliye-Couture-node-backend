import { Request, Response } from "express";

import { asyncHandler } from "../utils/asyncHandler";
import * as feed from "../services/notificationFeed";
import { HttpStatus } from "../constants/httpstatus";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import { getPagination } from "../utils/pagination";

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();

  const { skip, limit, page } = getPagination(req);
  const [items, unread] = await Promise.all([
    feed.listForUser(req.authUser.id, skip, limit),
    feed.countUnread(req.authUser.id),
  ]);

  ApiResponse.success(res, HttpStatus.OK, "Notifications fetched", { items, unread }, {
    page,
    limit,
    total: items.length,
    totalPages: 1,
  });
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  const notification = await feed.markRead(req.params.id, req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, "Notification marked read", notification);
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw ApiError.unauthorized();
  await feed.markAllRead(req.authUser.id);
  ApiResponse.success(res, HttpStatus.OK, "All notifications marked read");
});
