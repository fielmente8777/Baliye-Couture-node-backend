import { Schema, model, Document, Types } from 'mongoose';

/**
 * One selectable value inside a group: "Chanderi" in Fabric, "Boat Neck" in
 * Neck, "Wine" in Colour.
 *
 * Options live in one shared catalog rather than per product, so adding a
 * fabric once makes it offerable everywhere — the product team then picks
 * which ones a given garment type or product actually exposes.
 */
export interface IOption extends Document {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  label: string;
  /** Slug, unique within the group: 'chanderi', 'boat-neck'. */
  value: string;
  description?: string;

  /** Swatch or thumbnail shown in the selection grid. */
  image?: string;
  /** Colour groups only — hex for a swatch with no image. */
  hex?: string;

  /**
   * Added to the base price when selected, in minor units (paise).
   * Integers only: floats and money do not mix.
   */
  priceModifier: number;

  /**
   * Options in OTHER groups this one goes with. Empty means it pairs with
   * everything. Works both ways, in step order (`isPairable` in
   * services/customization.ts): an embroidery lists the colours, necks,
   * sleeves, lengths, lowers and dupattas it suits. Set in the Design
   * Builder ("Only offer with"), or by AI Studio for linked embroidery
   * (`syncStudioPairing`).
   */
  pairsWith: Types.ObjectId[];

  /**
   * Embroidery options only: which approved asset collection (BK-EMB-…) this
   * option renders with. Unset = the option has no embroidery to draw.
   */
  assetCollectionId?: string;

  position: number;
  isActive: boolean;
  isDeleted: boolean;
}

const optionSchema = new Schema<IOption>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'OptionGroup', required: true, index: true },
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    image: { type: String },
    hex: { type: String, trim: true },
    priceModifier: { type: Number, default: 0 },
    pairsWith: [{ type: Schema.Types.ObjectId, ref: 'Option' }],
    assetCollectionId: { type: String, trim: true },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

optionSchema.index({ groupId: 1, value: 1 }, { unique: true });

export const OptionModel = model<IOption>('Option', optionSchema);
