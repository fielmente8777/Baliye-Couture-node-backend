import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import {
  createMeasurementProfileSchema,
  createMeasurementTemplateSchema,
  idParamSchema,
  updateMeasurementProfileSchema,
  updateMeasurementTemplateSchema,
} from '../types/measurement';
import {
  createMeasurementProfile,
  createMeasurementTemplate,
  deleteMeasurementProfile,
  deleteMeasurementTemplate,
  getMeasurementProfile,
  getMeasurementProfiles,
  getMeasurementTemplates,
  updateMeasurementProfile,
  updateMeasurementTemplate,
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
/**
 * Readable by any signed-in user: the storefront cannot render the measurement
 * form without knowing which fields exist. Only writes stay admin-only.
 */
measurementRoutes.get('/template', authenticate, getMeasurementTemplates);

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
 *     summary: (User) List my saved measurement profiles
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profiles, default first
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     summary: (User) Save a new measurement profile
 *     description: The first profile a user saves becomes their default automatically.
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateMeasurementProfileBody' }
 *     responses:
 *       201: { description: Profile created }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: A profile with that name already exists }
 */
measurementRoutes.get('/', authenticate, authorize(Role.USER), getMeasurementProfiles);
measurementRoutes.post(
  '/',
  authenticate,
  authorize(Role.USER),
  validate(createMeasurementProfileSchema),
  createMeasurementProfile
);

/**
 * @openapi
 * /measurements/{id}:
 *   get:
 *     summary: (User) Get one of my measurement profiles
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Profile }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: (User) Update one of my measurement profiles
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateMeasurementProfileBody' }
 *     responses:
 *       200: { description: Profile updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: A profile with that name already exists }
 *   delete:
 *     summary: (User) Delete one of my measurement profiles
 *     description: Soft delete. If it was the default, the next profile becomes default.
 *     tags: [Measurements]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Profile deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
measurementRoutes.get(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validate(idParamSchema),
  getMeasurementProfile
);
measurementRoutes.put(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validate(updateMeasurementProfileSchema),
  updateMeasurementProfile
);
measurementRoutes.delete(
  '/:id',
  authenticate,
  authorize(Role.USER),
  validate(idParamSchema),
  deleteMeasurementProfile
);

export default measurementRoutes;
