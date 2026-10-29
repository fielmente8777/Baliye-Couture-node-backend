import { z } from 'zod';

const objectId = z.string().length(24);
const idParams = z.object({ id: objectId });

/** Same shape as types/catalog.ts — one step of a garment. */
const optionConfigSchema = z.object({
  groupId: objectId,
  position: z.number().int().min(0).default(0),
  isRequired: z.boolean().default(false),
  allowedOptions: z.array(objectId).default([]),
  defaultOption: objectId.optional(),
  dependsOn: z
    .object({
      groupId: objectId,
      optionIds: z.array(objectId).min(1),
    })
    .optional(),
});

const garmentBody = {
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000),
  family: z.enum(['indian', 'western', 'indo-western']),
  /** Paise. */
  basePrice: z.number().int().nonnegative(),
  isDesignable: z.boolean(),
  position: z.number().int(),
  isActive: z.boolean(),
  optionConfigs: z.array(optionConfigSchema),
  measurementTemplates: z.array(objectId),
};

export const createCatalogGarmentSchema = z.object({
  body: z
    .object(garmentBody)
    .partial()
    .required({ name: true, basePrice: true }),
});

export const updateCatalogGarmentSchema = z.object({
  params: idParams,
  body: z.object(garmentBody).partial(),
});

const inputTypes = [
  'single_select',
  'multi_select',
  'color_select',
  'size_select',
  'measurement',
  'number',
  'text',
  'image_upload',
] as const;

const groupBody = {
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  inputType: z.enum(inputTypes),
  position: z.number().int(),
  isActive: z.boolean(),
};

export const createCatalogGroupSchema = z.object({
  body: z
    .object({ ...groupBody, code: z.string().trim().max(40) })
    .partial()
    .required({ label: true }),
});

export const updateCatalogGroupSchema = z.object({
  params: idParams,
  body: z.object(groupBody).partial(),
});

const optionBody = {
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  hex: z.string().trim().regex(/^#[0-9a-f]{6}$/i, 'Use a colour like #a1b2c3').or(z.literal('')),
  /** Paise added to the garment price. */
  priceModifier: z.number().int().nonnegative(),
  position: z.number().int(),
  isActive: z.boolean(),
  /** Options in other steps this one is limited to (embroidery → necks). */
  pairsWith: z.array(objectId),
};

export const createCatalogOptionSchema = z.object({
  params: z.object({ groupId: objectId }),
  body: z.object(optionBody).partial().required({ label: true }),
});

export const updateCatalogOptionSchema = z.object({
  params: idParams,
  body: z.object(optionBody).partial(),
});

export const catalogItemIdSchema = z.object({ params: idParams });

export const catalogImageSchema = z.object({
  body: z.object({ key: z.string().trim().toLowerCase().min(3).max(200) }),
});
