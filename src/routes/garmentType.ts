import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { slugParamSchema } from '../types/catalog';
import { getDesignableTypes, getGarmentTypeBySlug } from '../controllers/garmentType';

/**
 * Public garment types — the "What do you want to design?" picker.
 * Browsable signed-out: a customer configures a design before being asked to
 * log in, which only happens at add-to-cart.
 */
const garmentTypeRoutes = Router();

/**
 * @openapi
 * /garment-types:
 *   get:
 *     summary: List garment types available to design
 *     description: >
 *       Powers the "What do you want to design?" step. Only active, designable
 *       types are returned — a type can exist for products while being closed
 *       to custom design.
 *     tags: [Catalog]
 *     security: []
 *     parameters:
 *       - name: family
 *         in: query
 *         schema: { type: string, enum: [indian, western, indo-western] }
 *     responses:
 *       200:
 *         description: Garment types, ordered for display
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
garmentTypeRoutes.get('/', getDesignableTypes);

/**
 * @openapi
 * /garment-types/{slug}:
 *   get:
 *     summary: Get one garment type
 *     tags: [Catalog]
 *     security: []
 *     parameters:
 *       - name: slug
 *         in: path
 *         required: true
 *         schema: { type: string, example: patiala-suit }
 *     responses:
 *       200: { description: Garment type }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
garmentTypeRoutes.get('/:slug', validate(slugParamSchema), getGarmentTypeBySlug);


export default garmentTypeRoutes;
