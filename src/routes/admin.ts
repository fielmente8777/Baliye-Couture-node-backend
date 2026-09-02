import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { authorize } from "../middlewares/role";
import { Role } from "../constants/role";
import { validate } from "../middlewares/validate";

import {
  catalogIdParamSchema,
  createGarmentTypeSchema,
  createProductSchema,
  productListQuerySchema,
  productStatusSchema,
  updateGarmentTypeSchema,
  updateProductSchema,
} from "../types/catalog";

import {
  getAdminProfile,
  getAllUsers,
  updateAdminProfile,
} from "../controllers/admin";
import {
  createGarmentType,
  deleteGarmentType,
  getAllGarmentTypes,
  getGarmentTypeWithOptions,
  updateGarmentType,
} from "../controllers/garmentType";
import {
  createProduct,
  deleteProduct,
  getProductById,
  listAllProducts,
  setProductStatus,
  updateProduct,
} from "../controllers/product";
import {
  attachImage,
  generateVariants,
  listImageJobs,
  refreshImageJob,
} from "@controllers/imageGeneration";
import {
  generateVariantsSchema,
  attachImageSchema,
  studioGenerateSchema,
} from "../types/imagejob";
// import { attachImageSchema, generateVariantsSchema } from "@types/imagejob";

const adminRoutes = Router();

/** Every route below is admin-only; the guard is applied once here. */
adminRoutes.use(authenticate, authorize(Role.ADMIN));

/**
 * @openapi
 * /admin/me:
 *   get:
 *     summary: Get the signed-in admin's profile
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Admin profile }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   put:
 *     summary: Update the signed-in admin's profile
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Admin profile updated }
 */
adminRoutes.get("/me", getAdminProfile);
adminRoutes.put("/me", updateAdminProfile);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     summary: List customers
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated users }
 */
adminRoutes.get("/users", getAllUsers);

/**
 * @openapi
 * /admin/garment-types:
 *   get:
 *     summary: List every garment type, including inactive
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Garment types }
 *   post:
 *     summary: Create a garment type
 *     description: >
 *       `optionConfigs` defines which option groups the type exposes, in what
 *       order, which are required, which options are allowed, and any
 *       dependencies between them.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateGarmentTypeBody' }
 *     responses:
 *       201: { description: Garment type created }
 *       409: { description: A garment type with that name already exists }
 */
adminRoutes.get("/garment-types", getAllGarmentTypes);
adminRoutes.post(
  "/garment-types",
  validate(createGarmentTypeSchema),
  createGarmentType,
);

/**
 * @openapi
 * /admin/garment-types/{id}:
 *   get:
 *     summary: Get a garment type with its option groups expanded
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Garment type with resolvedGroups }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: Update a garment type or its customization config
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateGarmentTypeBody' }
 *     responses:
 *       200: { description: Garment type updated }
 *   delete:
 *     summary: Soft-delete a garment type
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Garment type deleted }
 */
adminRoutes.get(
  "/garment-types/:id",
  validate(catalogIdParamSchema),
  getGarmentTypeWithOptions,
);
adminRoutes.put(
  "/garment-types/:id",
  validate(updateGarmentTypeSchema),
  updateGarmentType,
);
adminRoutes.delete(
  "/garment-types/:id",
  validate(catalogIdParamSchema),
  deleteGarmentType,
);

/**
 * @openapi
 * /admin/products:
 *   get:
 *     summary: List products in every status
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200: { description: Paginated products }
 *   post:
 *     summary: Create a product
 *     description: Created as a draft unless a status is set explicitly.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateProductBody' }
 *     responses:
 *       201: { description: Product created }
 *       409: { description: A product with that name already exists }
 */
adminRoutes.get("/products", validate(productListQuerySchema), listAllProducts);
adminRoutes.post("/products", validate(createProductSchema), createProduct);

/**
 * @openapi
 * /admin/products/{id}:
 *   get:
 *     summary: Get a product in any status
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Product }
 *   put:
 *     summary: Update a product
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateProductBody' }
 *     responses:
 *       200: { description: Product updated }
 *   delete:
 *     summary: Archive a product
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Product archived }
 */
adminRoutes.get(
  "/products/:id",
  validate(catalogIdParamSchema),
  getProductById,
);
adminRoutes.put("/products/:id", validate(updateProductSchema), updateProduct);
adminRoutes.delete(
  "/products/:id",
  validate(catalogIdParamSchema),
  deleteProduct,
);

/**
 * @openapi
 * /admin/products/{id}/status:
 *   patch:
 *     summary: Move a product through its lifecycle
 *     description: >
 *       Publishing to `active` is refused unless the product has at least one
 *       image and a base price — a broken listing should fail here, not be
 *       discovered by a customer.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ProductStatusBody' }
 *     responses:
 *       200: { description: Status updated }
 *       400: { description: Product is not ready to publish }
 */
adminRoutes.patch(
  "/products/:id/status",
  validate(productStatusSchema),
  setProductStatus,
);

adminRoutes.post(
  "/products/:id/generate-variants",
  validate(generateVariantsSchema),
  generateVariants,
);
adminRoutes.get(
  "/products/:id/image-jobs",
  validate(catalogIdParamSchema),
  listImageJobs,
);
adminRoutes.post(
  "/image-jobs/:id/refresh",
  validate(catalogIdParamSchema),
  refreshImageJob,
);
adminRoutes.post(
  "/image-jobs/:id/attach",
  validate(attachImageSchema),
  attachImage,
);

// adminRoutes.post("/ai/studio", validate(studioGenerateSchema), studioGenerate);
// adminRoutes.get("/ai/studio", listStudioJobs);

export default adminRoutes;
