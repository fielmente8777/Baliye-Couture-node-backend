import { z } from 'zod';

const objectId = z.string().length(24);

/* ---- Garment types ---- */

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

export const createGarmentTypeSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    slug: z.string().max(120).optional(),
    description: z.string().max(1000).optional(),
    image: z.string().optional(),
    family: z.enum(['indian', 'western', 'indo-western']).default('indian'),
    basePrice: z.number().int().nonnegative(),
    measurementTemplates: z.array(objectId).default([]),
    optionConfigs: z.array(optionConfigSchema).default([]),
    isDesignable: z.boolean().default(true),
    position: z.number().int().default(0),
    isActive: z.boolean().default(true),
  }),
});

export const updateGarmentTypeSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().max(1000).optional(),
    image: z.string().optional(),
    family: z.enum(['indian', 'western', 'indo-western']).optional(),
    basePrice: z.number().int().nonnegative().optional(),
    measurementTemplates: z.array(objectId).optional(),
    optionConfigs: z.array(optionConfigSchema).optional(),
    isDesignable: z.boolean().optional(),
    position: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
});

/* ---- Products ---- */

const productImageSchema = z.object({
  url: z.string().min(1),
  alt: z.string().max(200).optional(),
  type: z
    .enum(['front', 'back', 'side', 'detail', 'model', 'fabric', 'embroidery', 'guide'])
    .default('front'),
  position: z.number().int().default(0),
  colorOptionId: objectId.optional(),
});

const productBody = {
  name: z.string().min(2).max(200),
  slug: z.string().max(220).optional(),
  description: z.string().max(5000).optional(),
  shortDescription: z.string().max(300).optional(),
  garmentTypeId: objectId,
  mode: z.enum(['predesigned', 'customizable', 'both']).default('predesigned'),
  brand: z.string().max(100).optional(),
  tags: z.array(z.string().max(40)).default([]),
  sku: z.string().max(60).optional(),
  /** Minor units — the backend never stores fractional currency. */
  basePrice: z.number().int().nonnegative(),
  salePrice: z.number().int().nonnegative().optional(),
  images: z.array(productImageSchema).default([]),
  videos: z.array(z.string()).default([]),
  customizableOptions: z.array(optionConfigSchema).default([]),
  presetSelections: z
    .array(z.object({ groupId: objectId, optionId: objectId }))
    .default([]),
  trackInventory: z.boolean().default(false),
  stock: z.number().int().nonnegative().default(0),
  isMadeToOrder: z.boolean().default(true),
  leadTimeDays: z.number().int().positive().default(21),
  isBestseller: z.boolean().default(false),
  isEditorsPick: z.boolean().default(false),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
};

export const createProductSchema = z.object({
  body: z.object(productBody),
});

export const updateProductSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object(productBody).partial(),
});

export const productStatusSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(['draft', 'active', 'inactive', 'archived']),
  }),
});

export const productListQuerySchema = z.object({
  query: z.object({
    garmentTypeId: objectId.optional(),
    tag: z.string().optional(),
    badge: z.enum(['bestseller', 'editors-pick']).optional(),
    mode: z.enum(['predesigned', 'customizable', 'both']).optional(),
    minPrice: z.coerce.number().int().optional(),
    maxPrice: z.coerce.number().int().optional(),
    search: z.string().optional(),
    sort: z.enum(['newest', 'price-asc', 'price-desc', 'popular', 'rating']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

export const slugParamSchema = z.object({
  params: z.object({ slug: z.string().min(1).max(220) }),
});

export const catalogIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});
