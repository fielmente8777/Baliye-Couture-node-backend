import { z } from "zod";

/** Base64 without the data: prefix — the Magnific API rejects data URLs. */
const base64Image = z.string().min(100, "Provide a base64 image");

export const extractMotifsSchema = z.object({
  body: z
    .object({
      /**
       * Several photographs of the SAME garment. Front, sleeve and hem views
       * together produce a far more complete sheet than one image, and the
       * prompt de-duplicates borders that appear in more than one.
       */
      views: z
        .array(
          z.object({
            image: base64Image,
            /** "front", "left sleeve", "hem detail". */
            label: z.string().max(80).optional(),
          }),
        )
        .min(1)
        .max(8)
        .optional(),

      /** Single-image form, kept so existing callers keep working. */
      donorImage: base64Image.optional(),

      /**
       * Crop a single photo to one border and name it — the most faithful mode
       * when you only want the neckline. Ignored when several views are sent.
       */
      region: z.enum(["neckline", "sleeve", "hem", "placket", "motif"]).optional(),

      /** Optional: pass an existing runId to group both stages together. */
      runId: z.string().uuid().optional(),
    })
    .refine((body) => Boolean(body.views?.length) || Boolean(body.donorImage), {
      message: "Provide either views[] or donorImage",
    }),
});

export const applyMotifsSchema = z.object({
  body: z.object({
    targetImage: base64Image,

    /**
     * One or more embroidery sheets. Each is a URL from stage 1, or base64 for
     * a sheet downloaded earlier and re-uploaded — which is how a saved
     * embroidery gets reused across colourways.
     */
    sheets: z
      .array(
        z.object({
          image: z.string().min(10),
          /** "neckline sheet", "cuff sheet", "hem sheet". */
          label: z.string().max(80).optional(),
        }),
      )
      .min(1)
      .max(4)
      .optional(),

    /** Single-sheet form, kept so existing callers keep working. */
    motifSheetImage: z.string().min(10).optional(),
    instruction: z.string().max(1000).optional(),
    /** Each variation is a separate paid generation. */
    variations: z.number().int().min(1).max(4).default(1),
    sourceJobId: z.string().length(24).optional(),
    runId: z.string().uuid().optional(),
  })
  .refine((body) => Boolean(body.sheets?.length) || Boolean(body.motifSheetImage), {
    message: "Provide either sheets[] or motifSheetImage",
  }),
});

export const runIdParamSchema = z.object({
  params: z.object({ runId: z.string().uuid() }),
});
