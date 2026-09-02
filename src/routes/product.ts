import { Router } from "express";
import { validate } from "../middlewares/validate";
import { productListQuerySchema, slugParamSchema } from "../types/catalog";
import {
  getProductBySlug,
  getRelatedProducts,
  listProducts,
} from "../controllers/product";

/**
 * Public product catalog. Powers the collections grid, Bestsellers,
 * Editor's Picks and the product detail page.
 */
const productRoutes = Router();

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
productRoutes.get("/", listProducts);

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
productRoutes.get("/:slug", validate(slugParamSchema), getProductBySlug);

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
productRoutes.get(
  "/:slug/related",
  validate(slugParamSchema),
  getRelatedProducts,
);

export default productRoutes;
