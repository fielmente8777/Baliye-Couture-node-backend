import { z } from 'zod';

const objectId = z.string().length(24);

const selectionSchema = z.object({
  groupId: objectId,
  optionId: objectId,
});

/** Either a garment type (Create Your Own Design) or a product (customize). */
const designBody = {
  garmentTypeId: objectId.optional(),
  productId: objectId.optional(),
  name: z.string().max(120).optional(),
  selections: z.array(selectionSchema).default([]),
  measurementProfileId: objectId.optional(),
  sizeOptionId: objectId.optional(),
  instructions: z.string().max(1000).optional(),
};

export const designConfigQuerySchema = z.object({
  query: z.object({
    garmentTypeId: objectId.optional(),
    productId: objectId.optional(),
  }),
});

export const quotePriceSchema = z.object({
  body: z.object(designBody),
});

export const createDesignSchema = z.object({
  body: z.object(designBody),
});

export const designIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});
