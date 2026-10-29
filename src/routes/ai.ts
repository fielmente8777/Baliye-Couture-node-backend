import { Router } from "express";

import { validate } from "../middlewares/validate";
import {
  applyMotifsSchema,
  extractMotifsSchema,
  runIdParamSchema,
} from "../types/motif";
import {
  applyMotifs,
  extractMotifs,
  getRun,
  listRuns,
} from "../controllers/motifTransfer";
import {
  applyAssetsSchema,
  approveAssetSchema,
  assetIdParamSchema,
  buildAssetsSchema,
  collectionParamSchema,
  detectLandmarksSchema,
  renameCollectionSchema,
  updateAssetSchema,
} from "../types/embroidery";
import {
  applyAssets,
  approveAsset,
  previewPlacement,
  buildAssets,
  findLandmarks,
  getAssets,
  getCollections,
  getExtractions,
  removeAsset,
  removeCollection,
  renameCollection,
  updateAsset,
} from "../controllers/embroidery";

/**
 * Embroidery transfer studio.
 *
 * Mounted under /admin/ai (routes/admin.ts), behind the admin guard: every
 * call here spends OpenAI credits, so it must never be open — anyone who
 * found the URL could drain the balance in a loop.
 */
import {
  baseGarmentIdParamSchema,
  clearRendersSchema,
  createBaseGarmentSchema,
  embroideryCollectionSchema,
} from "../types/render";
import {
  clearRenders,
  createBaseGarment,
  deleteBaseGarment,
  listBaseGarments,
  setEmbroideryCollection,
} from "../controllers/designRender";

import { checkImageProvider } from "../config/imageAI";
import { getImageUsageReport } from "../services/imageUsageReport";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { HttpStatus } from "../constants/httpstatus";

const aiRoutes = Router();

/**
 * @openapi
 * /admin/ai/status:
 *   get:
 *     summary: Check the OpenAI image setup
 *     description: >
 *       Confirms OPENAI_API_KEY works and the configured model is available,
 *       without generating (or paying for) an image.
 *     tags: [AI Studio]
 */
aiRoutes.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const status = await checkImageProvider();
    ApiResponse.success(res, HttpStatus.OK, "Image provider status", status);
  }),
);

/**
 * @openapi
 * /admin/ai/usage:
 *   get:
 *     summary: OpenAI image tokens and estimated cost
 *     description: >
 *       Totals by stage (extract, apply, render, variant) and by day, plus
 *       everything since the backend last started. `?days=30` by default.
 *     tags: [AI Studio]
 */
aiRoutes.get(
  "/usage",
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    ApiResponse.success(res, HttpStatus.OK, "Image usage", await getImageUsageReport(days));
  }),
);


/**
 * @openapi
 * /admin/ai/extract-motifs:
 *   post:
 *     summary: Stage 1 — isolate embroidery from a donor garment
 *     description: >
 *       Returns a job immediately. Poll `/ai/runs/{runId}` until it completes,
 *       then pass its result URL to /ai/apply-motifs. One paid generation.
 *     tags: [AI Studio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ExtractMotifsBody' }
 *     responses:
 *       202: { description: Extraction queued }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
aiRoutes.post("/extract-motifs", validate(extractMotifsSchema), extractMotifs);

/**
 * @openapi
 * /admin/ai/apply-motifs:
 *   post:
 *     summary: Stage 2 — apply a motif sheet to a target garment
 *     description: >
 *       `motifSheetImage` is the result URL from stage 1, or a base64 sheet.
 *       Each variation is a separate paid generation.
 *     tags: [AI Studio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApplyMotifsBody' }
 *     responses:
 *       202: { description: Generation queued }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
aiRoutes.post("/apply-motifs", validate(applyMotifsSchema), applyMotifs);

/**
 * @openapi
 * /admin/ai/runs/{runId}:
 *   get:
 *     summary: Poll every job in a run
 *     description: Refreshes any pending generations before returning.
 *     tags: [AI Studio]
 *     parameters:
 *       - name: runId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Jobs in the run, oldest first }
 */
aiRoutes.get("/runs/:runId", validate(runIdParamSchema), getRun);

/**
 * @openapi
 * /admin/ai/runs:
 *   get:
 *     summary: Studio history
 *     tags: [AI Studio]
 *     responses:
 *       200: { description: Recent jobs, newest first }
 */
aiRoutes.get("/runs", listRuns);

/**
 * @openapi
 * /admin/ai/assets/build:
 *   post:
 *     summary: Split a finished extraction into named embroidery assets
 *     description: >
 *       No AI cost — the sheet is separated with image processing. Each piece
 *       gets a name, a garment region and default placement, and starts
 *       unapproved. Pass `sourceInkHex` to check for colour drift.
 *     tags: [AI Studio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BuildAssetsBody' }
 *     responses:
 *       201: { description: Assets created, with any colour warning }
 */
aiRoutes.post("/assets/build", validate(buildAssetsSchema), buildAssets);

/**
 * @openapi
 * /admin/ai/assets/collections:
 *   get:
 *     summary: Embroidery collections, newest first
 *     tags: [AI Studio]
 *     responses:
 *       200: { description: Collections with asset and approval counts }
 */
aiRoutes.get("/assets/collections", getCollections);
/* Finished extractions + what each was saved as, so an unsaved one can be reopened. */
aiRoutes.get("/extractions", getExtractions);
aiRoutes.patch("/assets/collections/:collectionId", validate(renameCollectionSchema), renameCollection);
aiRoutes.delete("/assets/collections/:collectionId", validate(collectionParamSchema), removeCollection);

/**
 * @openapi
 * /admin/ai/assets:
 *   get:
 *     summary: List embroidery assets
 *     tags: [AI Studio]
 *     parameters:
 *       - name: collectionId
 *         in: query
 *         schema: { type: string }
 *       - name: approvedOnly
 *         in: query
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: Assets }
 */
aiRoutes.get("/assets", getAssets);

/**
 * @openapi
 * /admin/ai/assets/{id}:
 *   put:
 *     summary: Rename an asset, change its region, or adjust its placement
 *     description: >
 *       Changing the region resets placement to that region's defaults unless
 *       an explicit placement is sent — otherwise a piece relabelled from buti
 *       to neckline keeps buti scaling and lands wrong.
 *     tags: [AI Studio]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateEmbroideryAssetBody' }
 *     responses:
 *       200: { description: Asset updated }
 *   delete:
 *     summary: Delete an asset
 *     tags: [AI Studio]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200: { description: Asset deleted }
 */
aiRoutes.put("/assets/:id", validate(updateAssetSchema), updateAsset);
aiRoutes.delete("/assets/:id", validate(assetIdParamSchema), removeAsset);

/**
 * @openapi
 * /admin/ai/assets/{id}/approve:
 *   patch:
 *     summary: Approve or unapprove an asset
 *     description: Only approved assets can be applied to a garment.
 *     tags: [AI Studio]
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApproveAssetBody' }
 *     responses:
 *       200: { description: Asset updated }
 */
aiRoutes.patch("/assets/:id/approve", validate(approveAssetSchema), approveAsset);

/**
 * @openapi
 * /admin/ai/landmarks:
 *   post:
 *     summary: Detect garment landmarks on a blank suit
 *     description: >
 *       Returns neckline, shoulders, cuffs and hem as fractions, plus a
 *       confidence. Below 0.6 the detection is unreliable — a pale garment on a
 *       similar backdrop cannot be separated by colour — and the operator
 *       should mark the landmarks instead.
 *     tags: [AI Studio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/DetectLandmarksBody' }
 *     responses:
 *       200: { description: Landmarks and confidence }
 */
aiRoutes.post("/landmarks", validate(detectLandmarksSchema), findLandmarks);

/**
 * @openapi
 * /admin/ai/assets/apply:
 *   post:
 *     summary: Apply approved assets to a garment with deterministic placement
 *     description: >
 *       Composites the assets onto the garment using their stored landmark
 *       anchors, then uses one generation call purely to blend and relight.
 *       Placement is arithmetic; only realism is generated. Same cost as before.
 *     tags: [AI Studio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApplyAssetsBody' }
 *     responses:
 *       202: { description: Generation started, with the placed-piece count }
 *       400: { description: No approved assets, or landmarks could not be found }
 */
aiRoutes.post("/assets/apply", validate(applyAssetsSchema), applyAssets);

/**
 * @openapi
 * /admin/ai/assets/preview:
 *   post:
 *     summary: Render the composite without generating
 *     description: >
 *       Shows exactly where each approved piece will land. Costs nothing, so an
 *       operator can adjust placement and re-check freely before spending a
 *       generation.
 *     tags: [AI Studio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApplyAssetsBody' }
 *     responses:
 *       200: { description: Composite as a data URL, plus the placed count }
 */
aiRoutes.post("/assets/preview", validate(applyAssetsSchema), previewPlacement);

/* Base garment library — one blank garment per garment type + neck (+ sleeve). */
aiRoutes.post("/base-garments", validate(createBaseGarmentSchema), createBaseGarment);
aiRoutes.get("/base-garments", listBaseGarments);
aiRoutes.delete("/base-garments/:id", validate(baseGarmentIdParamSchema), deleteBaseGarment);

/* Which approved embroidery collection an Embroidery option renders with. */
aiRoutes.put(
  "/embroidery-options/:optionId/collection",
  validate(embroideryCollectionSchema),
  setEmbroideryCollection,
);

/* Forget cached design renders after re-shooting a base or changing assets. */
aiRoutes.post("/renders/clear", validate(clearRendersSchema), clearRenders);

export default aiRoutes;
