import { Router } from "express";

import { authenticate } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { idParamSchema } from "../types/measurement";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notification";

const notificationRoutes = Router();

/** Admins have notifications too, so this is not restricted to Role.USER. */
notificationRoutes.use(authenticate);

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: My notifications, newest first
 *     description: Returns `{ items, unread }` so the navbar badge needs one call.
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200: { description: Notifications and unread count }
 */
notificationRoutes.get("/", getNotifications);

/**
 * @openapi
 * /notifications/read-all:
 *   patch:
 *     summary: Mark every notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All marked read }
 */
notificationRoutes.patch("/read-all", markAllNotificationsRead);

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark one notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Marked read }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
notificationRoutes.patch("/:id/read", validate(idParamSchema), markNotificationRead);

export default notificationRoutes;
