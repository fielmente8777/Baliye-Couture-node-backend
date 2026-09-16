import { Schema, model, Document, Types } from 'mongoose';

/**
 * Where an embroidery piece belongs on a garment.
 *
 * Each region maps to a landmark the placement engine can find on any garment,
 * which is what lets one asset move between a kurti and an anarkali. Regions
 * we cannot anchor are regions that would drift, so the list is deliberately
 * short.
 */
export type EmbroideryRegion =
  | 'neckline'
  | 'chest'
  | 'sleeve_cuff'
  | 'sleeve_body'
  | 'hem_border'
  | 'placket'
  | 'buti'
  | 'lower_hem';

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
  collectionName: string;

  name: string;
  region: EmbroideryRegion;

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
  chest: {
    anchor: 'shoulder_left', offset: { x: 0.06, y: 0.16 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.26 },
    align: 'center', rotation: 0, mirror: true, tile: false,
  },
  sleeve_cuff: {
    anchor: 'cuff_left', offset: { x: 0, y: -0.02 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.30 },
    align: 'center', rotation: 0, mirror: true, tile: false,
  },
  sleeve_body: {
    anchor: 'shoulder_left', offset: { x: -0.04, y: 0.22 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.18 },
    align: 'center', rotation: 0, mirror: true, tile: false,
  },
  hem_border: {
    anchor: 'hem_center', offset: { x: 0, y: -0.005 },
    scale: { relativeTo: 'hemWidth', factor: 1.0 },
    align: 'bottom', rotation: 0, mirror: false, tile: true,
  },
  placket: {
    anchor: 'neckline_point', offset: { x: 0, y: 0.02 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.10 },
    align: 'top', rotation: 0, mirror: false, tile: false,
  },
  buti: {
    /* Scattered motifs are a distribution, not a position — the compositor
       seeds a repeatable scatter rather than reading offset. */
    anchor: 'body_center', offset: { x: 0, y: 0 },
    scale: { relativeTo: 'shoulderWidth', factor: 0.055 },
    align: 'center', rotation: 0, mirror: false, tile: false,
  },
  lower_hem: {
    anchor: 'hem_center', offset: { x: 0, y: 0.06 },
    scale: { relativeTo: 'hemWidth', factor: 1.0 },
    align: 'bottom', rotation: 0, mirror: false, tile: true,
  },
};

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
