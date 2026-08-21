import { z } from 'zod';
import { DESIGN_OPTION_CATEGORIES } from '@models/designoption';

const objectId = z.string().length(24);

export const createDesignOptionSchema = z.object({
  body: z.object({
    category: z.enum(DESIGN_OPTION_CATEGORIES as [string, ...string[]]),
    label: z.string().min(1).max(100),
    value: z.string().min(1).max(100),
    swatchImage: z.string().url().optional(),
    priceModifier: z.number().default(0),
  }),
});

export const updateDesignOptionSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    label: z.string().min(1).max(100).optional(),
    value: z.string().min(1).max(100).optional(),
    swatchImage: z.string().url().optional(),
    priceModifier: z.number().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const createSuitDesignSchema = z.object({
  body: z.object({
    name: z.string().max(100).optional(),
    suitType: objectId.optional(),
    color: objectId.optional(),
    fabric: objectId.optional(),
    lapel: objectId.optional(),
    buttons: objectId.optional(),
    pocketStyle: objectId.optional(),
    collar: objectId.optional(),
    sleeveStyle: objectId.optional(),
    backStyle: objectId.optional(),
    vent: objectId.optional(),
    lining: objectId.optional(),
    monogram: z.string().max(10).optional(),
    embroidery: z.string().max(100).optional(),
    fit: objectId.optional(),
    pantStyle: objectId.optional(),
    pleats: objectId.optional(),
    cuffs: objectId.optional(),
    length: z.string().max(50).optional(),
    customNotes: z.string().max(500).optional(),
    basePrice: z.number().nonnegative().default(0),
  }),
});

export const updateSuitDesignSchema = z.object({
  params: z.object({ id: objectId }),
  body: createSuitDesignSchema.shape.body.partial(),
});