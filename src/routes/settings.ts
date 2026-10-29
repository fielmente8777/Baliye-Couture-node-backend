import { Router } from 'express';
import { getSettings } from '../controllers/settings';

const settingsRoutes = Router();

/**
 * @openapi
 * /settings:
 *   get:
 *     summary: Feature switches the storefront reads
 *     description: "`creditsEnabled` — show and charge design credits."
 *     tags: [Settings]
 *     security: []
 *     responses:
 *       200: { description: Settings }
 */
settingsRoutes.get('/', getSettings);

export default settingsRoutes;
