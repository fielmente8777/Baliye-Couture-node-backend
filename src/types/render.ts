import { z } from 'zod';

const objectId = z.string().length(24);

export const renderKeyParamSchema = z.object({
  params: z.object({ key: z.string().regex(/^[a-f0-9]{40}$/) }),
});

export const recolourPhotoSchema = z.object({
  body: z
    .object({
      imageUrl: z.string().url().max(2048),
      /** Colour only (older clients). */
      colourOptionId: objectId.optional(),
      /** Every chosen option that should show in the picture, with its picture. */
      options: z
        .array(z.object({ optionId: objectId, imageUrl: z.string().url().max(2048).optional() }))
        .max(12)
        .optional(),
    })
    .refine((body) => body.colourOptionId || body.options?.length, {
      message: 'Choose at least one option to show',
    }),
});

export const embroideryCollectionSchema = z.object({
  params: z.object({ optionId: objectId }),
  body: z.object({ collectionId: z.string().min(1).max(60).nullable() }),
});

