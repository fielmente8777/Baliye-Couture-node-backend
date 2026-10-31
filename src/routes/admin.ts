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
import { addMember, getTeam, removeMember, requireOwner, updateMember } from "../controllers/team";
import { addMemberSchema, memberParamSchema, updateMemberSchema } from "../types/team";
import {
  getAdminProfile,
  getAllUsers,
  updateAdminProfile,
} from "../controllers/admin";
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

/* Team members: extra admin logins the owner adds (Admin -> Team). Owners only. */
/**
 * @openapi
 * /admin/team:
 *   get:
 *     summary: Everyone who can sign in to the admin panel
 *     description: >
 *       Owners only. Owners first, then team members, with role, on/off and last sign-in.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Admin accounts }
 *       403: { description: Not an owner }
 *   post:
 *     summary: Add a team member
 *     description: >
 *       Owners only. The member signs in at /admin/login with this email and password and
 *       sees the whole panel except Team.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AddTeamMemberBody' }
 *     responses:
 *       201: { description: Member added }
 *       409: { description: That email is already used }
 */
adminRoutes.get("/team", requireOwner, getTeam);
adminRoutes.post("/team", requireOwner, validate(addMemberSchema), addMember);
/**
 * @openapi
 * /admin/team/{id}:
 *   patch:
 *     summary: Rename a team member, set their password, or switch them on or off
 *     description: >
 *       Owners only, for members (not owners). A new password or switching off signs them out
 *       on every device.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateTeamMemberBody' }
 *     responses:
 *       200: { description: Member updated }
 *       403: { description: Owner accounts cannot be changed here }
 */
adminRoutes.patch("/team/:id", requireOwner, validate(updateMemberSchema), updateMember);
/**
 * @openapi
 * /admin/team/{id}:
 *   delete:
 *     summary: Remove a team member or another owner
 *     description: >
 *       Owners only. Deletes the login and signs it out everywhere. Refuses your own account
 *       and the last active owner.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Removed }
 *       403: { description: Your own account, or the last owner }
 *       404: { description: Not found }
 */
adminRoutes.delete("/team/:id", requireOwner, validate(memberParamSchema), removeMember);

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

/* ---- Orders ----
   The controllers existed but were never routed, so the admin had no way to
   move an order through Cutting → Stitching → … or cancel it. */
/**
 * @openapi
 * /admin/orders:
 *   get:
 *     summary: List made-to-order orders
 *     description: >
 *       Orders created by this server for custom designs. Ready-to-wear orders live in Shopify.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200: { description: Orders }
 */
adminRoutes.get("/orders", getAllOrdersAdmin);
/**
 * @openapi
 * /admin/orders/{id}:
 *   get:
 *     summary: One made-to-order order
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Order }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a made-to-order order
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
adminRoutes.get("/orders/:id", validate(idParamSchema), getOrderByIdAdmin);
/**
 * @openapi
 * /admin/orders/{id}/status:
 *   patch:
 *     summary: Move an order to its next production status
 *     description: >
 *       Pending, Confirmed, Measurement Verified, Cutting, Stitching, Quality Check, Ready, Shipped,
 *       Delivered, or Cancelled; only the next allowed status is accepted. The customer sees it under My orders.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateOrderStatusBody' }
 *     responses:
 *       200: { description: Status updated }
 *       400: { description: Not a valid next status }
 */
adminRoutes.patch("/orders/:id/status", validate(updateOrderStatusSchema), updateOrderStatusAdmin);
/**
 * @openapi
 * /admin/orders/{id}/cancel:
 *   put:
 *     summary: Cancel a made-to-order order
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CancelOrderBody' }
 *     responses:
 *       200: { description: Cancelled }
 *       400: { description: Already dispatched or cancelled }
 */
adminRoutes.put("/orders/:id/cancel", validate(cancelOrderSchema), cancelOrderAdmin);
adminRoutes.delete("/orders/:id", validate(idParamSchema), deleteOrderAdmin);

/* ---- Replacement & alteration requests ---- */
/**
 * @openapi
 * /admin/replacements:
 *   get:
 *     summary: All replacement and alteration requests
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [requested, approved, rejected, in_progress, completed] } }
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *     responses:
 *       200: { description: Requests }
 */
adminRoutes.get("/replacements", validate(replacementListQuerySchema), adminListReplacements);
/**
 * @openapi
 * /admin/replacements/{id}:
 *   patch:
 *     summary: Approve, reject or progress a replacement request
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateReplacementBody' }
 *     responses:
 *       200: { description: Request updated }
 *       404: { description: Not found }
 */
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

/**
 * @openapi
 * /admin/catalog/garments:
 *   post:
 *     summary: Add a garment to the Design Builder
 *     description: >
 *       Creates the garment and its Shopify entries. A garment deleted earlier with the same name
 *       is brought back instead.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCatalogGarmentBody' }
 *     responses:
 *       201: { description: Garment created }
 *       409: { description: A garment with that name already exists }
 */
adminRoutes.post("/catalog/garments", validate(createCatalogGarmentSchema), catalogAdmin.createGarment);
/**
 * @openapi
 * /admin/catalog/garments/{id}:
 *   put:
 *     summary: "Update a garment: details, steps in the builder, measurements asked for"
 *     description: >
 *       Name, price, description and visibility are also written to Shopify.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateCatalogGarmentBody' }
 *     responses:
 *       200: { description: Garment updated }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a garment
 *     description: >
 *       Soft delete: gone from the Design Builder and the website, hidden in Shopify.
 *       Saved designs and orders keep their copy.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
adminRoutes.put("/catalog/garments/:id", validate(updateCatalogGarmentSchema), catalogAdmin.updateGarment);
adminRoutes.delete("/catalog/garments/:id", validate(catalogItemIdSchema), catalogAdmin.deleteGarment);

/**
 * @openapi
 * /admin/catalog/groups:
 *   post:
 *     summary: Add a step (option group), e.g. Dupatta
 *     description: >
 *       Then add it to a garment with PUT /admin/catalog/garments/{id}.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCatalogGroupBody' }
 *     responses:
 *       201: { description: Step created }
 *       409: { description: A step with that code already exists }
 */
adminRoutes.post("/catalog/groups", validate(createCatalogGroupSchema), catalogAdmin.createGroup);
/**
 * @openapi
 * /admin/catalog/groups/{id}:
 *   put:
 *     summary: Update a step's title and help text
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateCatalogGroupBody' }
 *     responses:
 *       200: { description: Step updated }
 *       404: { description: Not found }
 */
adminRoutes.put("/catalog/groups/:id", validate(updateCatalogGroupSchema), catalogAdmin.updateGroup);
/**
 * @openapi
 * /admin/catalog/groups/{groupId}/options:
 *   post:
 *     summary: Add an option to a step
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: groupId, in: path, required: true, schema: { type: string }, description: Option group id }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCatalogOptionBody' }
 *     responses:
 *       201: { description: Option created }
 *       404: { description: Step not found }
 */
adminRoutes.post("/catalog/groups/:groupId/options", validate(createCatalogOptionSchema), catalogAdmin.createOption);

/**
 * @openapi
 * /admin/catalog/options/{id}:
 *   put:
 *     summary: "Update an option: name, price, picture, visibility, pairing"
 *     description: >
 *       pairsWith lists options from other steps it goes with; pairing works both ways in step
 *       order. For embroidery linked in AI Studio, AI Studio keeps the pairing in sync.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateCatalogOptionBody' }
 *     responses:
 *       200: { description: Option updated }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete an option from every garment
 *     description: >
 *       Also removed from every other option's pairing. Saved designs keep their copy.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
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
 *     summary: Save a page's content (home, products, footer, terms)
 *     description: >
 *       Replaces the page's saved content. Open website pages pick it up within
 *       seconds (see GET /content/version).
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: path, required: true, schema: { type: string, enum: [home, products, footer, terms] } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SaveContentBody' }
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
/**
 * @openapi
 * /admin/content/write:
 *   post:
 *     summary: "Write with AI: draft or rework text for a content field"
 *     description: >
 *       Returns a suggestion only; nothing is saved until PUT /admin/content/{page}.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/WriteContentBody' }
 *     responses:
 *       200: { description: Suggested text }
 */
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
