import { z } from "zod";

/** Base64 without the data: prefix — the Magnific API rejects data URLs. */
const base64Image = z.string().min(100, "Provide a base64 image");

export const extractMotifsSchema = z.object({
  body: z.object({
    donorImage: base64Image,
    /**
     * Crop the photo to one border and name it — far more faithful than
     * asking for the whole garment at once. Omit for the old behaviour.
     */
    region: z.enum(["neckline", "sleeve", "hem", "placket", "motif"]).optional(),
    /** Optional: pass an existing runId to group both stages together. */
    runId: z.string().uuid().optional(),
  }),
});

export const applyMotifsSchema = z.object({
  body: z.object({
    targetImage: base64Image,
    /** A URL from stage 1, or a base64 sheet the operator uploaded directly. */
    motifSheetImage: z.string().min(10),
    instruction: z.string().max(1000).optional(),
    /** Each variation is a separate paid generation. */
    variations: z.number().int().min(1).max(4).default(1),
    sourceJobId: z.string().length(24).optional(),
    runId: z.string().uuid().optional(),
  }),
});

export const runIdParamSchema = z.object({
  params: z.object({ runId: z.string().uuid() }),
});
