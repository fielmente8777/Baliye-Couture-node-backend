import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/role';
import { Role } from '../constants/role';
import { validate } from '../middlewares/validate';
import { createDesignOptionSchema, createSuitDesignSchema, updateDesignOptionSchema, updateSuitDesignSchema } from '../types/design';
import { createDesign, createDesignOption, deleteDesign, deleteDesignOption, getDesignById, getDesignOptions, getDesigns, updateDesign, updateDesignOption } from '../controllers/design';
import { idParamSchema } from '../types/measurement';


const designRoutes = Router();

/**
 * @openapi
 * /design/options:
 *   post:
 *     summary: (Admin) Add a design option (e.g. a fabric or lapel style)
 *     tags: [Design]
 *   get:
 *     summary: List available design options, optionally filtered by category
 *     tags: [Design]
 */
designRoutes.post(
  '/options',
  authenticate,
  authorize(Role.ADMIN),
  validate(createDesignOptionSchema),
  createDesignOption
);
designRoutes.get('/options', authenticate, getDesignOptions);
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
 *     tags: [Design]
 *   get:
 *     summary: (User) List my saved suit designs
 *     tags: [Design]
 */
designRoutes.post(
  '/',
  authenticate,
  authorize(Role.USER),
  validate(createSuitDesignSchema),
  createDesign
);
designRoutes.get('/', authenticate, authorize(Role.USER), getDesigns);
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