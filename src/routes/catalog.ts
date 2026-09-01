import { Router } from 'express';
import { validate } from '../middlewares/validate';
import {
  catalogIdParamSchema,
  productListQuerySchema,
  slugParamSchema,
} from '../types/catalog';
import {
  getDesignableTypes,
  getGarmentTypeBySlug,
} from '../controllers/garmentType';
import {
  getProductBySlug,
  getRelatedProducts,
  listProducts,
} from '../controllers/product';

/**
 * Public catalog. Everything here is browsable signed-out — a customer should
 * be able to see what is for sale and configure a design before being asked to
 * log in, which only happens at add-to-cart.
 */
const catalogRoutes = Router();

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
catalogRoutes.get('/garment-types', getDesignableTypes);

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
catalogRoutes.get('/garment-types/:slug', validate(slugParamSchema), getGarmentTypeBySlug);

/**
 * @openapi
 * /products:
 *   get:
 *     summary: List active products
 *     description: Powers the collections grid, Bestsellers and Editor's Picks.
 *     tags: [Catalog]
 *     security: []
 *     parameters:
 *       - name: garmentTypeId
 *         in: query
 *         schema: { type: string }
 *       - name: badge
 *         in: query
 *         schema: { type: string, enum: [bestseller, editors-pick] }
 *       - name: mode
 *         in: query
 *         schema: { type: string, enum: [predesigned, customizable, both] }
 *       - name: tag
 *         in: query
 *         schema: { type: string }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: minPrice
 *         in: query
 *         schema: { type: integer, description: Minor units }
 *       - name: maxPrice
 *         in: query
 *         schema: { type: integer }
 *       - name: sort
 *         in: query
 *         schema:
 *           type: string
 *           enum: [newest, price-asc, price-desc, popular, rating]
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: Paginated products
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
catalogRoutes.get('/products', validate(productListQuerySchema), listProducts);

/**
 * @openapi
 * /products/{slug}:
 *   get:
 *     summary: Get one product by slug
 *     tags: [Catalog]
 *     security: []
 *     parameters:
 *       - name: slug
 *         in: path
 *         required: true
 *         schema: { type: string, example: royal-embroidered-patiala-suit }
 *     responses:
 *       200: { description: Product }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
catalogRoutes.get('/products/:slug', validate(slugParamSchema), getProductBySlug);

/**
 * @openapi
 * /products/{slug}/related:
 *   get:
 *     summary: Products of the same garment type
 *     tags: [Catalog]
 *     security: []
 *     parameters:
 *       - name: slug
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Related products }
 */
catalogRoutes.get('/products/:slug/related', validate(slugParamSchema), getRelatedProducts);

export default catalogRoutes;
export { catalogIdParamSchema };
