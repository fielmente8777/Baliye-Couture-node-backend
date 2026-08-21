import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import {
  createDesignOptionSchema,
  createSuitDesignSchema,
  updateDesignOptionSchema,
  updateSuitDesignSchema,
} from '../types/design';
import {
  createDesign,
  createDesignOption,
  deleteDesign,
  deleteDesignOption,
  getDesignById,
  getDesignOptions,
  getDesigns,
  updateDesign,
  updateDesignOption,
} from '../controllers/design';
import { idParamSchema } from '../types/measurement';

const designRoutes = Router();

/**
 * @openapi
 * /design/options:
 *   post:
 *     summary: (Admin) Add a design option — a fabric, lapel, collar, etc.
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateDesignOptionBody' }
 *     responses:
 *       201: { description: Option created }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   get:
 *     summary: List design options, optionally filtered by category
 *     description: This is the endpoint the storefront calls to build the fabric grid.
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *           enum: [suitType, color, fabric, lapel, buttons, pocketStyle, collar,
 *                  sleeveStyle, backStyle, vent, lining, fit, pantStyle, pleats, cuffs]
 *         description: Omit to return every option.
 *     responses:
 *       200:
 *         description: Matching options
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
designRoutes.post(
  '/options',
  authenticate,
  authorize(Role.ADMIN),
  validate(createDesignOptionSchema),
  createDesignOption
);
designRoutes.get('/options', authenticate, getDesignOptions);

/**
 * @openapi
 * /design/options/{id}:
 *   put:
 *     summary: (Admin) Update a design option
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateDesignOptionBody' }
 *     responses:
 *       200: { description: Option updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: (Admin) Delete a design option
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Option deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
designRoutes.put(
  '/options/:id',
  authenticate,
  authorize(Role.ADMIN),
  validate(updateDesignOptionSchema),
  updateDesignOption
);
designRoutes.delete(
  '/options/:id',
  authenticate,
  authorize(Role.ADMIN),
  validate(idParamSchema),
  deleteDesignOption
);

/**
 * @openapi
 * /design:
 *   post:
 *     summary: (User) Save a custom suit design
 *     description: >
 *       totalPrice is computed server-side as basePrice plus the priceModifier
 *       of every referenced option — any value sent by the client is ignored.
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateSuitDesignBody' }
 *     responses:
 *       201: { description: Design saved }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     summary: (User) List my saved suit designs
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200:
 *         description: Paginated designs
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 */
designRoutes.post(
  '/',
  authenticate,
  authorize(Role.USER),
  validate(createSuitDesignSchema),
  createDesign
);
designRoutes.get('/', authenticate, authorize(Role.USER), getDesigns);

/**
 * @openapi
 * /design/{id}:
 *   get:
 *     summary: (User) Get one of my saved designs
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Design detail }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: (User) Update one of my saved designs
 *     tags: [Design]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateSuitDesignBody' }
 *     responses:
 *       200: { description: Design updated — totalPrice recalculated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: (User) Soft-delete one of my saved designs
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
  validate(idParamSchema),
  getDesignById
);
designRoutes.put(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validate(updateSuitDesignSchema),
  updateDesign
);
designRoutes.delete(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validate(idParamSchema),
  deleteDesign
);

export default designRoutes;
