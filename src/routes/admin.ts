import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { authorize } from "../middlewares/role";
import { Role } from "../constants/role";
import { validate } from "../middlewares/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { HttpStatus } from "../constants/httpstatus";
import { pullDesignCatalog } from "../services/designCatalogSync";
import { exportSubscribers, listSubscribers, removeSubscriber } from "../controllers/newsletter";
import { subscriberIdParamSchema } from "../types/newsletter";

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
} from "../types/imagejob";
// import { attachImageSchema, generateVariantsSchema } from "@types/imagejob";

import {
  cancelOrderAdmin,
  deleteOrderAdmin,
  getAllOrdersAdmin,
  getOrderByIdAdmin,
  updateOrderStatusAdmin,
} from "../controllers/order";
import { cancelOrderSchema, updateOrderStatusSchema } from "../types/order";
import { idParamSchema } from "../types/measurement";
import {
  adminListReplacements,
  adminUpdateReplacement,
} from "../controllers/replacement";
import {
  replacementListQuerySchema,
  updateReplacementSchema,
} from "../types/replacement";

import { getAiCredit, getCreditStats, getUserLedger, grantTokens, recordAiCredit } from "../controllers/tokens";
import { updateSettings } from "../controllers/settings";
import { updateSettingsSchema } from "../types/settings";
import { grantTokensSchema, recordAiCreditSchema, tokenUserParamSchema } from "../types/tokens";

import { memoryUpload, sheetUpload } from "../middlewares/file";
import * as catalogAdmin from "../controllers/adminCatalog";
import { saveContent, uploadImage, writeContent } from "../controllers/siteContent";
import aiRoutes from "./ai";
import { saveContentSchema, writeContentSchema } from "../types/siteContent";
import {
  catalogImageSchema,
  catalogItemIdSchema,
  createCatalogGarmentSchema,
  createCatalogGroupSchema,
  createCatalogOptionSchema,
  updateCatalogGarmentSchema,
  updateCatalogGroupSchema,
  updateCatalogOptionSchema,
} from "../types/adminCatalog";

const adminRoutes = Router();

/** Every route below is admin-only; the guard is applied once here. */
adminRoutes.use(authenticate, authorize(Role.ADMIN));

/* AI Studio — embroidery extraction, pieces, try-on. Spends OpenAI credit,
   so it lives behind the admin guard. */
adminRoutes.use("/ai", aiRoutes);

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
 * /admin/tokens/grant:
 *   post:
 *     summary: Add design tokens to a customer (negative amount corrects down)
 *     description: >
 *       How tokens are distributed until online purchase is wired: the customer
 *       pays, the admin adds the pack's tokens here. Every change is logged.
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, amount]
 *             properties:
 *               userId: { type: string }
 *               amount: { type: integer }
 *               note: { type: string }
 *               reason: { type: string, enum: [grant, purchase] }
 * /admin/tokens/{userId}:
 *   get:
 *     summary: A customer's token history
 *     tags: [Admin]
 */
adminRoutes.post("/tokens/grant", validate(grantTokensSchema), grantTokens);

/**
 * @openapi
 * /admin/tokens/stats:
 *   get:
 *     summary: Credit usage across all customers — totals and one row per customer with credit activity
 *     tags: [Admin]
 */
adminRoutes.get("/tokens/stats", getCreditStats);

/**
 * @openapi
 * /admin/ai-credit:
 *   get:
 *     summary: The store's own AI credit — prepaid OpenAI balance left, spend, designs it still covers
 *     tags: [Admin]
 *   post:
 *     summary: Record the balance shown on OpenAI's billing page, or a top-up made there
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, amountUsd]
 *             properties:
 *               kind: { type: string, enum: [balance, topup] }
 *               amountUsd: { type: number }
 *               note: { type: string }
 */
adminRoutes.get("/ai-credit", getAiCredit);
adminRoutes.post("/ai-credit", validate(recordAiCreditSchema), recordAiCredit);
adminRoutes.get("/tokens/:userId", validate(tokenUserParamSchema), getUserLedger);

/**
 * @openapi
 * /admin/settings:
 *   put:
 *     summary: Flip feature switches (design credits on/off)
 *     tags: [Admin]
 */
adminRoutes.put("/settings", validate(updateSettingsSchema), updateSettings);

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
 * /admin/design-catalog/sync:
 *   post:
 *     summary: Pull the design catalogue from Shopify now
 *     description: >
 *       Names, prices, descriptions, colours, images, visibility and order of
 *       garments and options are edited in Shopify (Design Option metaobjects).
 *       They are pulled automatically every two minutes; this does it at once.
 *     tags: [Admin]
 *     responses:
 *       200: { description: What was updated, created or skipped }
 */
adminRoutes.post(
  "/design-catalog/sync",
  asyncHandler(async (_req, res) => {
    const summary = await pullDesignCatalog();
    ApiResponse.success(res, HttpStatus.OK, "Design catalogue synced from Shopify", summary);
  }),
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

/* ---- Orders ----
   The controllers existed but were never routed, so the admin had no way to
   move an order through Cutting → Stitching → … or cancel it. */
adminRoutes.get("/orders", getAllOrdersAdmin);
adminRoutes.get("/orders/:id", validate(idParamSchema), getOrderByIdAdmin);
adminRoutes.patch("/orders/:id/status", validate(updateOrderStatusSchema), updateOrderStatusAdmin);
adminRoutes.put("/orders/:id/cancel", validate(cancelOrderSchema), cancelOrderAdmin);
adminRoutes.delete("/orders/:id", validate(idParamSchema), deleteOrderAdmin);

/* ---- Replacement & alteration requests ---- */
adminRoutes.get("/replacements", validate(replacementListQuerySchema), adminListReplacements);
adminRoutes.patch("/replacements/:id", validate(updateReplacementSchema), adminUpdateReplacement);

/* ---- Design Builder (create-your-own-design) ----
   Shopify-owned fields (name, price, description, colour, visibility, order,
   images) are written to Shopify and MongoDB together, so the two-minute
   pull from Shopify does not undo them. Steps and pairing rules are
   MongoDB only. See services/adminCatalog.ts. */

/**
 * @openapi
 * /admin/catalog:
 *   get:
 *     summary: Everything the Design Builder screen needs
 *     description: Garments, steps, options, measurement fields, and image urls by key as Shopify has them.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Catalogue }
 * /admin/catalog/images:
 *   post:
 *     summary: Upload a design image to Shopify and attach it to its key
 *     description: >
 *       multipart/form-data with `file` and `key` (garment/<slug>,
 *       preview/<slug> or option/<step code>/<option value>).
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The key and its new image url }
 */
adminRoutes.get("/catalog", catalogAdmin.getCatalog);
adminRoutes.post(
  "/catalog/images",
  memoryUpload.single("file"),
  validate(catalogImageSchema),
  catalogAdmin.uploadCatalogImage,
);

adminRoutes.post("/catalog/garments", validate(createCatalogGarmentSchema), catalogAdmin.createGarment);
adminRoutes.put("/catalog/garments/:id", validate(updateCatalogGarmentSchema), catalogAdmin.updateGarment);
adminRoutes.delete("/catalog/garments/:id", validate(catalogItemIdSchema), catalogAdmin.deleteGarment);

adminRoutes.post("/catalog/groups", validate(createCatalogGroupSchema), catalogAdmin.createGroup);
adminRoutes.put("/catalog/groups/:id", validate(updateCatalogGroupSchema), catalogAdmin.updateGroup);
adminRoutes.post("/catalog/groups/:groupId/options", validate(createCatalogOptionSchema), catalogAdmin.createOption);

adminRoutes.put("/catalog/options/:id", validate(updateCatalogOptionSchema), catalogAdmin.updateOption);
adminRoutes.delete("/catalog/options/:id", validate(catalogItemIdSchema), catalogAdmin.deleteOption);

/**
 * @openapi
 * /admin/catalog/sheet:
 *   get:
 *     summary: Download the Design Builder spreadsheet (.xlsx)
 *     description: Blank template by default; `?filled=true` fills it with the catalogue as it stands.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The workbook }
 * /admin/catalog/import:
 *   post:
 *     summary: Bulk add or update garments and options from the spreadsheet
 *     description: >
 *       multipart/form-data with up to two `files` (.xlsx, or Garments and
 *       Options .csv). Previews by default and writes nothing; `?apply=true`
 *       saves, and only when no row has an error. Never deletes.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Per-row report, step rule changes and warnings }
 */
adminRoutes.get("/catalog/sheet", catalogAdmin.downloadCatalogSheet);
adminRoutes.post("/catalog/import", sheetUpload.array("files", 2), catalogAdmin.importCatalog);

/* ---- Website content ---- */

/**
 * @openapi
 * /admin/content/{page}:
 *   put:
 *     summary: Save a page's content (home, footer, terms)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Saved }
 * /admin/uploads:
 *   post:
 *     summary: Upload a website image to Shopify Files
 *     description: multipart/form-data with `file`. Returns the CDN url.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The image url }
 */
/* Before /content/:page. "Write with AI" for any text field in the editor. */
adminRoutes.post("/content/write", validate(writeContentSchema), writeContent);
adminRoutes.put("/content/:page", validate(saveContentSchema), saveContent);
adminRoutes.post("/uploads", memoryUpload.single("file"), uploadImage);

/* ---- Newsletter ---- */

/**
 * @openapi
 * /admin/newsletter:
 *   get:
 *     summary: Newsletter subscribers, newest first
 *     description: "`search` matches part of the email. Paged with `page` and `limit` (max 200)."
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Subscribers }
 * /admin/newsletter/export:
 *   get:
 *     summary: Every subscriber as a CSV (email, source, signed_up)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: CSV file }
 * /admin/newsletter/{id}:
 *   delete:
 *     summary: Remove a subscriber
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Removed }
 */
adminRoutes.get("/newsletter", listSubscribers);
adminRoutes.get("/newsletter/export", exportSubscribers);
adminRoutes.delete("/newsletter/:id", validate(subscriberIdParamSchema), removeSubscriber);

export default adminRoutes;
