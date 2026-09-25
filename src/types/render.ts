import { z } from 'zod';

import { landmarksSchema } from './embroidery';

const objectId = z.string().length(24);

const selection = z.object({ groupId: objectId, optionId: objectId });

export const renderDesignSchema = z.object({
  body: z.object({
    garmentTypeId: objectId,
    selections: z.array(selection).max(30),
  }),
});

export const renderKeyParamSchema = z.object({
  params: z.object({ key: z.string().regex(/^[a-f0-9]{40}$/) }),
});

export const createBaseGarmentSchema = z.object({
  body: z.object({
    garmentTypeId: objectId,
    neckOptionId: objectId,
    sleeveOptionId: objectId.optional(),
    image: z.string().min(100, 'Provide a base64 garment image'),
    landmarks: landmarksSchema.optional(),
    mask: z.string().min(100).optional(),
  }),
});

export const baseGarmentIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const embroideryCollectionSchema = z.object({
  params: z.object({ optionId: objectId }),
  body: z.object({ collectionId: z.string().min(1).max(60).nullable() }),
});

export const clearRendersSchema = z.object({
  body: z.object({ garmentTypeId: objectId.optional() }),
});
