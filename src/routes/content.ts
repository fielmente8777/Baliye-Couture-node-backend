import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { getContent, getContentVersion } from '../controllers/siteContent';
import { contentPageParamSchema } from '../types/siteContent';

const contentRoutes = Router();

/**
 * @openapi
 * /content/{page}:
 *   get:
 *     summary: Website content edited in the admin panel
 *     description: >
 *       `data` is null until the page has been saved once; the website then
 *       shows its built-in defaults.
 *     tags: [Content]
 *     parameters:
 *       - name: page
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [home, footer, terms, products] }
 *     responses:
 *       200: { description: Saved content or null }
 */
/* Before /:page, or "version" would be read as a page name. Polled by open
   browsers to refresh within seconds of an admin save. */
/**
 * @openapi
 * /content/version:
 *   get:
 *     summary: When website content last changed
 *     description: >
 *       Polled by open pages so admin edits show within seconds without a reload.
 *     tags: [Content]
 *     security: []
 *     responses:
 *       200: { description: data.version, which changes whenever any content page is saved }
 */
contentRoutes.get('/version', getContentVersion);
contentRoutes.get('/:page', validate(contentPageParamSchema), getContent);

export default contentRoutes;
