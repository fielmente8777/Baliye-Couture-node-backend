import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import {
  createMeasurementTemplateSchema,
  idParamSchema,
  updateMeasurementTemplateSchema,
  updateUserMeasurementSchema,
} from '../types/measurement';
import {
  createMeasurementTemplate,
  deleteMeasurementTemplate,
  getMeasurementTemplates,
  getUserMeasurements,
  updateMeasurementTemplate,
  updateUserMeasurements,
} from '../controllers/measurement';

const measurementRoutes = Router();

/**
 * @openapi
 * /measurements/template:
 *   post:
 *     summary: (Admin) Create a measurement template
 *     description: Templates define which measurement fields the storefront collects.
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateMeasurementTemplateBody' }
 *     responses:
 *       201: { description: Template created }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   get:
 *     summary: (Admin) List measurement templates
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: activeOnly
 *         in: query
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Templates
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
measurementRoutes.post(
  '/template',
  authenticate,
  authorize(Role.ADMIN),
  validate(createMeasurementTemplateSchema),
  createMeasurementTemplate
);
measurementRoutes.get('/template', authenticate, authorize(Role.ADMIN), getMeasurementTemplates);

/**
 * @openapi
 * /measurements/template/{id}:
 *   put:
 *     summary: (Admin) Update a measurement template
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateMeasurementTemplateBody' }
 *     responses:
 *       200: { description: Template updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: (Admin) Delete a measurement template
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Template deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
measurementRoutes.put(
  '/template/:id',
  authenticate,
  authorize(Role.ADMIN),
  validate(updateMeasurementTemplateSchema),
  updateMeasurementTemplate
);
measurementRoutes.delete(
  '/template/:id',
  authenticate,
  authorize(Role.ADMIN),
  validate(idParamSchema),
  deleteMeasurementTemplate
);

/**
 * @openapi
 * /measurements:
 *   get:
 *     summary: (User) Get my saved measurements
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The user's measurement record
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   put:
 *     summary: (User) Create or replace my measurements
 *     description: Upserts — there is one measurement record per user.
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateUserMeasurementBody' }
 *     responses:
 *       200: { description: Measurements saved }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
measurementRoutes.get('/', authenticate, authorize(Role.USER), getUserMeasurements);
measurementRoutes.put(
  '/',
  authenticate,
  authorize(Role.USER),
  validate(updateUserMeasurementSchema),
  updateUserMeasurements
);

export default measurementRoutes;
