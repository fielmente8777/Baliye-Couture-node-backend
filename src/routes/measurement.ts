import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import { createMeasurementTemplateSchema, idParamSchema, updateMeasurementTemplateSchema, updateUserMeasurementSchema } from '../types/measurement';
import { createMeasurementTemplate, deleteMeasurementTemplate, getMeasurementTemplates, getUserMeasurements, updateMeasurementTemplate, updateUserMeasurements } from '../controllers/measurement';

const measurementRoutes = Router();

/**
 * @openapi
 * /measurements/template:
 *   post:
 *     summary: (Admin) Create a predefined measurement template
 *     tags: [Measurements]
 *   get:
 *     summary: (Admin) List all measurement templates
 *     tags: [Measurements]
 */
measurementRoutes.post(
  '/template',
  authenticate,
  authorize(Role.ADMIN),
  validate(createMeasurementTemplateSchema),
  createMeasurementTemplate
);
measurementRoutes.get(
  '/template',
  authenticate,
  authorize(Role.ADMIN),
  getMeasurementTemplates
);
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
 *     summary: (User) Get my body measurements (seeded from templates on first fetch)
 *     tags: [Measurements]
 *   put:
 *     summary: (User) Update my body measurement values
 *     tags: [Measurements]
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