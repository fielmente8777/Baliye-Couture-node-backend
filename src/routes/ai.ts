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

/**
 * Embroidery transfer studio.
 *
 * TEMPORARILY UNGUARDED so the feature can be demoed without an admin login.
 *
 * Every call here spends Magnific credits, so this must not reach production
 * open — anyone who finds the URL could drain the balance in a loop. Restore
 * the guard by uncommenting the line below, and move the frontend calls back
 * to /admin/ai/*.
 */
const aiRoutes = Router();

// aiRoutes.use(authenticate, authorize(Role.ADMIN));

/**
 * @openapi
 * /ai/extract-motifs:
 *   post:
 *     summary: Stage 1 — isolate embroidery from a donor garment
 *     description: >
 *       Returns a job immediately. Poll `/ai/runs/{runId}` until it completes,
 *       then pass its result URL to /ai/apply-motifs. One paid generation.
 *     tags: [AI Studio]
 *     security: []
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
 * /ai/apply-motifs:
 *   post:
 *     summary: Stage 2 — apply a motif sheet to a target garment
 *     description: >
 *       `motifSheetImage` is the result URL from stage 1, or a base64 sheet.
 *       Each variation is a separate paid generation.
 *     tags: [AI Studio]
 *     security: []
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
 * /ai/runs/{runId}:
 *   get:
 *     summary: Poll every job in a run
 *     description: Refreshes any pending Magnific tasks before returning.
 *     tags: [AI Studio]
 *     security: []
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
 * /ai/runs:
 *   get:
 *     summary: Studio history
 *     tags: [AI Studio]
 *     security: []
 *     responses:
 *       200: { description: Recent jobs, newest first }
 */
aiRoutes.get("/runs", listRuns);

export default aiRoutes;
