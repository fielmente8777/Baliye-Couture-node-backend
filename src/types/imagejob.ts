import { z } from "zod";

const objectId = z.string().length(24);

/**
 * Each entry in `combinations` is one paid generation. Capped so an admin
 * can't accidentally spend a month's credits with one click.
 */
export const generateVariantsSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    /** Base64 image without the data: prefix — the API rejects data URLs. */
    referenceImage: z.string().min(100, "Provide a base64 reference image"),
    combinations: z
      .array(
        z
          .array(z.object({ groupId: objectId, optionId: objectId }))
          .min(1, "Each combination needs at least one option"),
      )
      .min(1)
      .max(8),
  }),
});

export const attachImageSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    imageUrl: z.string().url(),
  }),
});

export const jobIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const studioGenerateSchema = z.object({
  body: z.object({
    referenceImage: z.string().min(100, "Provide a base64 reference image"),
    prompt: z.string().min(3).max(1000),
    /** Each variation is a separate paid generation. */
    variations: z.number().int().min(1).max(4).default(1),
  }),
});
