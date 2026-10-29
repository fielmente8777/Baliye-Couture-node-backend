import { Schema, model, Document, Types } from 'mongoose';

/**
 * Where an embroidery piece belongs on a garment.
 *
 * Each region maps to a landmark the placement engine can find on any garment,
 * which is what lets one asset move between a kurti and an anarkali. Regions
 * we cannot anchor are regions that would drift, so the list stays short.
 * `back` is kept for the record but never placed: the blank garment is always
 * photographed from the front.
 */
export const EMBROIDERY_REGIONS = [
  'neckline',
  'yoke',
  'placket',
  'shoulder',
  'chest',
  'sleeve_body',
  'sleeve_cuff',
  'waist',
  'buti',
  'hem_border',
  'lower_hem',
  'back',
] as const;

export type EmbroideryRegion = (typeof EMBROIDERY_REGIONS)[number];

/**
 * What each region means, in words. Shown to the admin, and given to the
 * vision model that labels pieces, so both use the same definitions.
 */
export const REGION_GUIDE: Record<EmbroideryRegion, string> = {
  neckline: 'Neckline (gala) — the border that follows the neck opening',
  yoke: 'Yoke — the panel of work just below the neckline, across the upper chest',
  placket: 'Placket — the narrow vertical strip down the centre front, below the neck',
  shoulder: 'Shoulder — a motif sitting on top of the shoulder',
  chest: 'Chest — a motif on the left or right of the chest, or one in the centre',
  sleeve_body: 'Sleeve (bazu) — a motif on the sleeve itself, between shoulder and cuff',
  sleeve_cuff: 'Sleeve cuff — the border at the end of the sleeve',
  waist: 'Waist (kamar) — a band or motif across the waist',
  buti: 'Buti — a small motif repeated all over the body',
  hem_border: 'Hem border (daaman) — the long border along the bottom edge',
  lower_hem: 'Lower border — a second, thinner band just above or below the hem border',
  back: 'Back — work on the back of the garment (kept for reference, not placed)',
};

/**
 * Which side of the garment, as seen in the photo.
 *
 * pair: one piece used on both sides, mirrored (most shoulders and cuffs).
 * left / right: work that only appears on one side.
 * center: on the centre line.
 */
export const EMBROIDERY_SIDES = ['pair', 'left', 'right', 'center'] as const;
export type EmbroiderySide = (typeof EMBROIDERY_SIDES)[number];

/** Regions placed against a left/right landmark, so `side` matters. */
export const SIDED_REGIONS: EmbroideryRegion[] = ['shoulder', 'chest', 'sleeve_body', 'sleeve_cuff'];

/**
 * Placement is stored against a garment feature, not against the image frame.
 *
 * Normalized frame coordinates ("18% from the top") only work if every garment
 * has the same proportions. A neckline sits ~14% down a knee-length kurti and
 * ~9% down a floor-length anarkali, so a fixed fraction lands on the chest.
 * Anchoring to the neckline point and scaling against shoulder width is
 * correct on both.
 */
export interface IPlacement {
  anchor:
    | 'neckline_point'
    | 'shoulder_left'
    | 'shoulder_right'
    | 'cuff_left'
    | 'cuff_right'
    | 'hem_center'
    | 'body_center';
  /** Offset from the anchor, as a fraction of garment width / height. */
  offset: { x: number; y: number };
  /** Size as a multiple of a garment dimension, not an absolute pixel size. */
  scale: { relativeTo: 'shoulderWidth' | 'garmentWidth' | 'hemWidth'; factor: number };
  /**
   * Which edge of the asset sits on the anchor.
   *
   * A neckline border hangs BELOW the neckline point, so centring it puts half
   * the piece on the mannequin's face. A hem border sits ABOVE the hem edge.
   */
  align: 'center' | 'top' | 'bottom';
  rotation: number;
  /** Mirror onto the opposite side — one asset serves both cuffs. */
  mirror: boolean;
  /** Repeat horizontally to fill the anchor's width, for borders. */
  tile: boolean;
}

export interface IEmbroideryAsset extends Document {
  _id: Types.ObjectId;
  /** Groups every piece taken from one source garment. */
  collectionId: string;
  /** What the admin calls the work, e.g. "Zari Work". */
  collectionName: string;

  name: string;
  region: EmbroideryRegion;
  side: EmbroiderySide;
  /** Zari, resham (thread), mirror, sequin, gota patti… */
  workType?: string;
  /**
   * One line describing the piece, e.g. "Gold zari paisley on the left
   * shoulder". Passed to the blend so the model renders the right material.
   */
  description?: string;
  /** True when the vision model chose the name and position. */
  aiLabelled: boolean;

  assetUrl: string;
  thumbnailUrl: string;

  /** Pixel size of the extracted crop, used to preserve aspect ratio. */
  width: number;
  height: number;

  placement: IPlacement;

  /** Dominant colour of the asset, used to catch extraction colour drift. */
  dominantHex?: string;

  /** An unapproved asset never reaches a customer-facing generation. */
  isApproved: boolean;
  approvedAt?: Date;

  sourceJobId?: Types.ObjectId;
  createdAt: Date;
}

/** Sensible starting placement per region; an operator can adjust after review. */
export const DEFAULT_PLACEMENT: Record<EmbroideryRegion, IPlacement> = {
  neckline: {
    anchor: 'neckline_point', offset: { x: 0, y: -0.01 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.62 },
    align: 'top', rotation: 0, mirror: false, tile: false,
  },
  yoke: {
    anchor: 'neckline_point', offset: { x: 0, y: 0.02 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.7 },
    align: 'top', rotation: 0, mirror: false, tile: false,
  },
  placket: {
    anchor: 'neckline_point', offset: { x: 0, y: 0.02 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.10 },
    align: 'top', rotation: 0, mirror: false, tile: false,
  },
  shoulder: {
    anchor: 'shoulder_left', offset: { x: 0.03, y: 0.015 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.16 },
    align: 'top', rotation: 0, mirror: true, tile: false,
  },
  chest: {
    anchor: 'shoulder_left', offset: { x: 0.06, y: 0.16 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.26 },
    align: 'center', rotation: 0, mirror: true, tile: false,
  },
  sleeve_body: {
    anchor: 'shoulder_left', offset: { x: -0.04, y: 0.22 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.18 },
    align: 'center', rotation: 0, mirror: true, tile: false,
  },
  sleeve_cuff: {
    anchor: 'cuff_left', offset: { x: 0, y: -0.02 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.30 },
    align: 'center', rotation: 0, mirror: true, tile: false,
  },
  waist: {
    anchor: 'body_center', offset: { x: 0, y: 0 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.9 },
    align: 'center', rotation: 0, mirror: false, tile: true,
  },
  buti: {
    /* Scattered motifs are a distribution, not a position — the compositor
       seeds a repeatable scatter rather than reading offset. */
    anchor: 'body_center', offset: { x: 0, y: 0 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.055 },
    align: 'center', rotation: 0, mirror: false, tile: false,
  },
  hem_border: {
    anchor: 'hem_center', offset: { x: 0, y: -0.005 },
    scale: { relativeTo: 'hemWidth', factor: 1.0 },
    align: 'bottom', rotation: 0, mirror: false, tile: true,
  },
  lower_hem: {
    anchor: 'hem_center', offset: { x: 0, y: 0.06 },
    scale: { relativeTo: 'hemWidth', factor: 1.0 },
    align: 'bottom', rotation: 0, mirror: false, tile: true,
  },
  back: {
    anchor: 'neckline_point', offset: { x: 0, y: 0 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.5 },
    align: 'top', rotation: 0, mirror: false, tile: false,
  },
};

/** The side a region gets when nothing says otherwise. */
export const defaultSide = (region: EmbroideryRegion): EmbroiderySide =>
  SIDED_REGIONS.includes(region) ? 'pair' : 'center';

/**
 * The region's default placement, adjusted for the side.
 *
 * Left/right landmarks are image-left/right. A pair is placed on the left and
 * mirrored onto the right; a one-sided piece is placed on its own side only,
 * with the horizontal offset turned around for the right. A centred chest
 * motif moves to the centre line under the neck.
 */
export function placementFor(region: EmbroideryRegion, side: EmbroiderySide = defaultSide(region)): IPlacement {
  const base: IPlacement = JSON.parse(JSON.stringify(DEFAULT_PLACEMENT[region]));
  if (!SIDED_REGIONS.includes(region)) return base;

  if (side === 'left') return { ...base, mirror: false };
  if (side === 'right') {
    return {
      ...base,
      anchor: base.anchor.replace('_left', '_right') as IPlacement['anchor'],
      offset: { ...base.offset, x: -base.offset.x },
      mirror: false,
    };
  }
  if (side === 'center' && region === 'chest') {
    return { ...base, anchor: 'neckline_point', offset: { x: 0, y: base.offset.y }, mirror: false };
  }
  return { ...base, mirror: true };
}

const placementSchema = new Schema<IPlacement>(
  {
    anchor: { type: String, required: true },
    offset: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 } },
    scale: {
      relativeTo: { type: String, default: 'shoulderWidth' },
      factor: { type: Number, default: 0.3 },
    },
    align: { type: String, enum: ['center', 'top', 'bottom'], default: 'center' },
    rotation: { type: Number, default: 0 },
    mirror: { type: Boolean, default: false },
    tile: { type: Boolean, default: false },
  },
  { _id: false }
);

const embroideryAssetSchema = new Schema<IEmbroideryAsset>(
  {
    collectionId: { type: String, required: true, index: true },
    collectionName: { type: String, required: true },
    name: { type: String, required: true },
    region: { type: String, required: true, index: true },
    side: { type: String, enum: EMBROIDERY_SIDES, default: 'center' },
    workType: { type: String, trim: true },
    description: { type: String, trim: true },
    aiLabelled: { type: Boolean, default: false },
    assetUrl: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    placement: { type: placementSchema, required: true },
    dominantHex: { type: String },
    isApproved: { type: Boolean, default: false, index: true },
    approvedAt: { type: Date },
    sourceJobId: { type: Schema.Types.ObjectId, ref: 'ImageJob' },
  },
  { timestamps: true }
);

export const EmbroideryAssetModel = model<IEmbroideryAsset>(
  'EmbroideryAsset',
  embroideryAssetSchema
);
