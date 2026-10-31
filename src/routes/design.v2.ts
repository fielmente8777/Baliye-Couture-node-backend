import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import {
  createDesignSchema,
  designConfigQuerySchema,
  designIdParamSchema,
  quotePriceSchema,
} from '../types/customdesign';
import {
  createDesign,
  deleteDesign,
  getDesignById,
  getDesignConfig,
  getMyDesigns,
  quotePrice,
} from '../controllers/design.v2';
import { getColourRender, lookupColourRender, recolourPhoto } from '../controllers/designRender';
import { recolourPhotoSchema, renderKeyParamSchema } from '../types/render';
import { renderRateLimiter } from '../middlewares/ratelimit';

const designRoutes = Router();

/**
 * @openapi
 * /designs/config:
 *   get:
 *     summary: Get the customization steps for a garment type or product
 *     description: >
 *       Returns the ordered option groups, the options inside each, and any
 *       preset selections. Pass `productId` to customize a pre-designed product —
 *       the response carries its garment type and presets, so the customer never
 *       has to choose a garment type. Pass `garmentTypeId` for Create Your Own
 *       Design. Public: the design page is browsable before signing in.
 *     tags: [Design]
 *     security: []
 *     parameters:
 *       - name: garmentTypeId
 *         in: query
 *         schema: { type: string }
 *       - name: productId
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Steps, options and presets
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400: { description: Neither id supplied, or the product is not customizable }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
designRoutes.get('/config', validate(designConfigQuerySchema), getDesignConfig);

/**
 * @openapi
 * /designs/quote:
 *   post:
 *     summary: Price a set of selections without saving
 *     description: >
 *       Backend is the source of truth for price (§31). Call this as the
 *       customer clicks swatches; the frontend may estimate, but this figure is
 *       what will be charged.
 *     tags: [Design]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/QuotePriceBody' }
 *     responses:
 *       200: { description: Price breakdown }
 *       400: { description: A selection is invalid, missing or not available }
 */
designRoutes.post('/quote', validate(quotePriceSchema), quotePrice);

/**
 * @openapi
 * /designs/recolour:
 *   post:
 *     tags: [Design]
 *     summary: The designer's AI preview for the customer's choices
 *     description: >
 *       AI edits a real garment photo (Shopify CDN or our own uploads) to show
 *       every chosen option in `options` (colour, fabric, neck, sleeve, length,
 *       embroidery…), each with the picture from its option card. Linked AI
 *       Studio embroidery is copied from its extracted sheet and pieces.
 *       `colourOptionId` alone still works for colour-only previews. Cached per
 *       photo + choices. While status is "generating", poll
 *       GET /designs/recolour/{key}; show url when status is "ready". Uses a
 *       design credit when credits are on.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RecolourPhotoBody' }
 */
designRoutes.post(
  '/recolour',
  renderRateLimiter,
  optionalAuthenticate,
  validate(recolourPhotoSchema),
  recolourPhoto
);

/**
 * @openapi
 * /designs/recolour/lookup:
 *   post:
 *     tags: [Design]
 *     summary: Is this preview already generated?
 *     description: >
 *       Free and never starts anything. Returns the cached preview, or null.
 *       With design tokens on, the builder calls this first and only offers a
 *       paid preview when it returns null.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RecolourPhotoBody' }
 */
designRoutes.post('/recolour/lookup', validate(recolourPhotoSchema), lookupColourRender);
/**
 * @openapi
 * /designs/recolour/{key}:
 *   get:
 *     summary: Poll a designer preview
 *     description: >
 *       Returns the preview started by POST /designs/recolour. Poll until status is "ready"
 *       (or "failed") and show its imageUrl.
 *     tags: [Design]
 *     security: []
 *     parameters:
 *       - { name: key, in: path, required: true, schema: { type: string }, description: 40-character preview key from POST /designs/recolour }
 *     responses:
 *       200: { description: Preview status and image }
 *       404: { description: Unknown key }
 */
designRoutes.get('/recolour/:key', validate(renderKeyParamSchema), getColourRender);

/**
 * @openapi
 * /designs:
 *   post:
 *     summary: Save a custom design
 *     description: >
 *       Every selection is re-validated and re-priced server-side, then frozen
 *       onto the design as a snapshot — later admin price changes cannot alter it.
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCustomDesignBody' }
 *     responses:
 *       201: { description: Design saved }
 *       400: { description: Validation failed }
 *   get:
 *     summary: List my saved designs
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200: { description: Designs }
 */
designRoutes.post(
  '/',
  authenticate,
  authorize(Role.USER),
  validate(createDesignSchema),
  createDesign
);
designRoutes.get('/', authenticate, authorize(Role.USER), getMyDesigns);

/**
 * @openapi
 * /designs/{id}:
 *   get:
 *     summary: Get one of my saved designs
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Design }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete one of my saved designs
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Design deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
designRoutes.get(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validate(designIdParamSchema),
  getDesignById
);
designRoutes.delete(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validate(designIdParamSchema),
  deleteDesign
);

export default designRoutes;
