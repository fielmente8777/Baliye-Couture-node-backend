import { z } from 'zod';

import { EMBROIDERY_REGIONS, EMBROIDERY_SIDES } from '../models/embroideryasset';

const objectId = z.string().length(24);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour');

export const buildAssetsSchema = z.object({
  body: z
    .object({
      /** A finished extraction… */
      jobId: objectId.optional(),
      /** …or a clean embroidery sheet, base64 — split for free, no generation. */
      sheetImage: z.string().min(100).optional(),
      collectionName: z.string().trim().min(1).max(120),
      /** Add to this existing collection rather than starting a new one. */
      collectionId: z.string().min(1).max(40).optional(),
      /** Small garment photos so the labeller can see where each piece sits. */
      references: z
        .array(z.object({ image: z.string().min(100), label: z.string().max(240).optional() }))
        .max(4)
        .optional(),
      /** A new embroidery's necklines (Neck Type option ids) and notes. */
      neckOptionIds: z.array(objectId).max(30).optional(),
      notes: z.string().max(1500).optional(),
      /** Enables the colour-drift check against the source garment's ink. */
      sourceInkHex: hex.optional(),
    })
    .refine((b) => Boolean(b.jobId) !== Boolean(b.sheetImage), 'Send either an extraction or a sheet image'),
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
    name: z.string().trim().min(1).max(120).optional(),
    region: z.enum(EMBROIDERY_REGIONS).optional(),
    side: z.enum(EMBROIDERY_SIDES).optional(),
    workType: z.string().trim().max(60).optional(),
    description: z.string().trim().max(300).optional(),
    placement: placementSchema.optional(),
  }),
});

export const collectionParamSchema = z.object({
  params: z.object({ collectionId: z.string().min(1).max(40) }),
});

/** Edit an embroidery: its name, necklines and notes, any of them. */
export const renameCollectionSchema = z.object({
  params: z.object({ collectionId: z.string().min(1).max(40) }),
  body: z
    .object({
      collectionName: z.string().trim().min(1).max(120).optional(),
      /** Neck Type options it suits; [] = every neckline. */
      neckOptionIds: z.array(objectId).max(30).optional(),
      notes: z.string().max(1500).optional(),
    })
    .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change'),
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

/** One copy of a piece, as read off the source photo (fractions of the target). */
const plannedPieceSchema = z.object({
  assetId: objectId,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.002).max(1),
  rotation: z.number().min(-180).max(180).default(0),
  flip: z.boolean().default(false),
});

export const applyAssetsSchema = z.object({
  body: z.object({
    targetImage: z.string().min(100, 'Provide a base64 garment image'),
    assetIds: z.array(objectId).min(1).max(20),
    instruction: z.string().max(1000).optional(),
    variations: z.number().int().min(1).max(4).default(1),
    runId: z.string().uuid().optional(),
    landmarks: landmarksSchema.optional(),
    /** Photo of the finished source design (base64): copy where its work sits. */
    referenceImage: z.string().min(100).optional(),
    /** The layout the preview read, reused so the generation matches it. */
    plan: z.array(plannedPieceSchema).max(80).optional(),
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
