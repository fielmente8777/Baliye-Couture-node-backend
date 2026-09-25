import { z } from 'zod';

const objectId = z.string().length(24);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour');

export const buildAssetsSchema = z.object({
  body: z.object({
    jobId: objectId,
    collectionName: z.string().min(1).max(120),
    /** Enables the colour-drift check against the source garment's ink. */
    sourceInkHex: hex.optional(),
  }),
});

const placementSchema = z.object({
  anchor: z.enum([
    'neckline_point',
    'shoulder_left',
    'shoulder_right',
    'cuff_left',
    'cuff_right',
    'hem_center',
    'body_center',
  ]),
  offset: z.object({ x: z.number(), y: z.number() }),
  scale: z.object({
    relativeTo: z.enum(['shoulderWidth', 'garmentWidth', 'hemWidth']),
    factor: z.number().positive().max(3),
  }),
  align: z.enum(['center', 'top', 'bottom']),
  rotation: z.number().min(-180).max(180),
  mirror: z.boolean(),
  tile: z.boolean(),
});

export const updateAssetSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    region: z
      .enum([
        'neckline',
        'chest',
        'sleeve_cuff',
        'sleeve_body',
        'hem_border',
        'placket',
        'buti',
        'lower_hem',
      ])
      .optional(),
    placement: placementSchema.optional(),
  }),
});

export const approveAssetSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ isApproved: z.boolean() }),
});

const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

/**
 * Landmarks marked by an operator. Required when automatic detection is
 * unreliable — a pale garment against a similar backdrop cannot be separated
 * by colour, and a blank suit is reused often enough that marking it once
 * is worthwhile.
 */
export const landmarksSchema = z.object({
  confidence: z.number().default(1),
  neckline: point,
  shoulderLeft: point,
  shoulderRight: point,
  cuffLeft: point,
  cuffRight: point,
  hemCenter: point,
  bodyCenter: point,
  shoulderWidth: z.number().positive(),
  garmentWidth: z.number().positive(),
  hemWidth: z.number().positive(),
  top: z.number(),
  bottom: z.number(),
});

export const applyAssetsSchema = z.object({
  body: z.object({
    targetImage: z.string().min(100, 'Provide a base64 garment image'),
    assetIds: z.array(objectId).min(1).max(20),
    instruction: z.string().max(1000).optional(),
    variations: z.number().int().min(1).max(4).default(1),
    runId: z.string().uuid().optional(),
    landmarks: landmarksSchema.optional(),
  }),
});

export const detectLandmarksSchema = z.object({
  body: z.object({
    image: z.string().min(100, 'Provide a base64 garment image'),
  }),
});

export const assetIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});
