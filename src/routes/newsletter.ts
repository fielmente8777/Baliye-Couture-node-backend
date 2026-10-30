import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { newsletterRateLimiter } from '../middlewares/ratelimit';
import { subscribe } from '../controllers/newsletter';
import { subscribeSchema } from '../types/newsletter';

const newsletterRoutes = Router();

/**
 * @openapi
 * /newsletter:
 *   post:
 *     summary: Join the newsletter from the website form
 *     description: Signing up again with the same email succeeds and changes nothing.
 *     tags: [Newsletter]
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *               source: { type: string, example: home }
 *     responses:
 *       200: { description: Subscribed }
 */
newsletterRoutes.post('/', newsletterRateLimiter, validate(subscribeSchema), subscribe);

export default newsletterRoutes;
