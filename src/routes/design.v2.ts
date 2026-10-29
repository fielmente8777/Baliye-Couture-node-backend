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
import {
  getColourRender,
  getRender,
  lookupColourRender,
  recolourPhoto,
  renderDesign,
} from '../controllers/designRender';
import { recolourPhotoSchema, renderDesignSchema, renderKeyParamSchema } from '../types/render';
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
 * /designs/render:
 *   post:
 *     tags: [Designs]
 *     summary: Image of the design for the current selections
 *     description: >
 *       Returns previewUrl immediately (exact colour, neckline and embroidery
 *       placement, built by code). If status is "blending", poll
 *       GET /designs/render/{key} and swap to finalUrl when status is "ready".
 *       status "unavailable" means no base image exists for that neck yet.
 */
designRoutes.post('/render', renderRateLimiter, validate(renderDesignSchema), renderDesign);
designRoutes.get('/render/:key', validate(renderKeyParamSchema), getRender);

/**
 * @openapi
 * /designs/recolour:
 *   post:
 *     tags: [Designs]
 *     summary: The design photo re-dyed to a colour option
 *     description: >
 *       AI re-dyes the fabric of a real garment photo (Shopify CDN or our own
 *       uploads) to the chosen Colour option, keeping embroidery, cut and pose.
 *       Cached per photo + colour. While status is "generating", poll
 *       GET /designs/recolour/{key}; show url when status is "ready".
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageUrl, colourOptionId]
 *             properties:
 *               imageUrl: { type: string }
 *               colourOptionId: { type: string }
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
 *     tags: [Designs]
 *     summary: Is this photo + colour already generated?
 *     description: >
 *       Free and never starts anything. Returns the cached recolour, or null.
 *       With design tokens on, the builder calls this first and only offers a
 *       paid preview when it returns null.
 *     security: []
 */
designRoutes.post('/recolour/lookup', validate(recolourPhotoSchema), lookupColourRender);
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
